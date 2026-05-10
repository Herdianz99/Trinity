import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IvaType } from '@prisma/client';
import {
  BulkImportDto,
  ImportCategoryDto,
  ImportBrandDto,
  ImportSupplierDto,
  ImportProductDto,
} from './dto/import.dto';

// ─── IVA multipliers (same as products.service) ─────────────────────

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};

// ─── Preview / report types ─────────────────────────────────────────

interface EntityPreview {
  create: number;
  exists: number;
}

interface ProductPreview {
  create: number;
  skip: number;
  errors: string[];
}

interface ImportPreview {
  categories: EntityPreview;
  brands: EntityPreview;
  suppliers: EntityPreview;
  products: ProductPreview;
}

export interface ValidateResult {
  valid: boolean;
  preview: ImportPreview;
}

export interface ImportReport {
  categories: { created: string[]; skipped: string[] };
  brands: { created: string[]; skipped: string[] };
  suppliers: { created: string[]; skipped: string[] };
  products: { created: string[]; skipped: string[]; errors: string[] };
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────────
  // VALIDATE (dry-run)
  // ────────────────────────────────────────────────────────────────────

  async validate(dto: BulkImportDto): Promise<ValidateResult> {
    const preview: ImportPreview = {
      categories: { create: 0, exists: 0 },
      brands: { create: 0, exists: 0 },
      suppliers: { create: 0, exists: 0 },
      products: { create: 0, skip: 0, errors: [] },
    };

    // --- Categories ---
    if (dto.categories?.length) {
      for (const cat of dto.categories) {
        const existing = await this.prisma.category.findUnique({
          where: { code: cat.code.toUpperCase() },
        });
        if (existing) {
          preview.categories.exists++;
        } else {
          preview.categories.create++;
        }
        // Count subcategories
        if (cat.subcategories?.length) {
          for (const subName of cat.subcategories) {
            const parentCode = cat.code.toUpperCase();
            const parent = existing || null;
            if (parent) {
              const existingSub = await this.prisma.category.findFirst({
                where: { name: subName, parentId: parent.id },
              });
              if (existingSub) {
                preview.categories.exists++;
              } else {
                preview.categories.create++;
              }
            } else {
              // parent will be created, so all subs are new
              preview.categories.create++;
            }
          }
        }
      }
    }

    // --- Brands ---
    if (dto.brands?.length) {
      for (const brand of dto.brands) {
        const existing = await this.prisma.brand.findFirst({
          where: { name: { equals: brand.name, mode: 'insensitive' } },
        });
        if (existing) {
          preview.brands.exists++;
        } else {
          preview.brands.create++;
        }
      }
    }

    // --- Suppliers ---
    if (dto.suppliers?.length) {
      for (const sup of dto.suppliers) {
        const existing = await this.prisma.supplier.findFirst({
          where: {
            OR: [
              { name: { equals: sup.name, mode: 'insensitive' } },
              ...(sup.rif ? [{ rif: sup.rif }] : []),
            ],
          },
        });
        if (existing) {
          preview.suppliers.exists++;
        } else {
          preview.suppliers.create++;
        }
      }
    }

    // --- Products ---
    if (dto.products?.length) {
      // Build a lookup of category names/codes from the payload + DB
      const categoryNames = new Set<string>();
      if (dto.categories?.length) {
        for (const c of dto.categories) {
          categoryNames.add(c.name.toLowerCase());
          if (c.subcategories) {
            for (const s of c.subcategories) {
              categoryNames.add(s.toLowerCase());
            }
          }
        }
      }
      // Also load existing categories from DB
      const dbCategories = await this.prisma.category.findMany();
      for (const c of dbCategories) {
        categoryNames.add(c.name.toLowerCase());
      }

      // Brand names lookup
      const brandNames = new Set<string>();
      if (dto.brands?.length) {
        for (const b of dto.brands) brandNames.add(b.name.toLowerCase());
      }
      const dbBrands = await this.prisma.brand.findMany();
      for (const b of dbBrands) brandNames.add(b.name.toLowerCase());

      // Supplier names lookup
      const supplierNames = new Set<string>();
      if (dto.suppliers?.length) {
        for (const s of dto.suppliers) supplierNames.add(s.name.toLowerCase());
      }
      const dbSuppliers = await this.prisma.supplier.findMany();
      for (const s of dbSuppliers) supplierNames.add(s.name.toLowerCase());

      for (const prod of dto.products) {
        // Check if product already exists (by code or name)
        const existingByCode = prod.code
          ? await this.prisma.product.findUnique({ where: { code: prod.code } })
          : null;
        const existingByName = await this.prisma.product.findFirst({
          where: { name: { equals: prod.name, mode: 'insensitive' } },
        });

        if (existingByCode || existingByName) {
          preview.products.skip++;
          continue;
        }

        // Validate referenced category exists or will be created
        if (prod.category && !categoryNames.has(prod.category.toLowerCase())) {
          preview.products.errors.push(
            `${prod.name}: categoria "${prod.category}" no encontrada`,
          );
          continue;
        }

        // Validate referenced subcategory
        if (prod.subcategory && !categoryNames.has(prod.subcategory.toLowerCase())) {
          preview.products.errors.push(
            `${prod.name}: subcategoria "${prod.subcategory}" no encontrada`,
          );
          continue;
        }

        // Validate brand
        if (prod.brand && !brandNames.has(prod.brand.toLowerCase())) {
          preview.products.errors.push(
            `${prod.name}: marca "${prod.brand}" no encontrada`,
          );
          continue;
        }

        // Validate supplier
        if (prod.supplier && !supplierNames.has(prod.supplier.toLowerCase())) {
          preview.products.errors.push(
            `${prod.name}: proveedor "${prod.supplier}" no encontrado`,
          );
          continue;
        }

        preview.products.create++;
      }
    }

    return {
      valid: preview.products.errors.length === 0,
      preview,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // EXECUTE IMPORT (in a transaction)
  // ────────────────────────────────────────────────────────────────────

  async executeImport(dto: BulkImportDto): Promise<ImportReport> {
    return this.prisma.$transaction(
      async (tx) => {
        const report: ImportReport = {
          categories: { created: [], skipped: [] },
          brands: { created: [], skipped: [] },
          suppliers: { created: [], skipped: [] },
          products: { created: [], skipped: [], errors: [] },
        };

        // ── 1. Categories ────────────────────────────────────────────
        const categoryMap = new Map<string, string>(); // name (lower) -> id

        // Pre-load existing categories
        const existingCategories = await tx.category.findMany();
        for (const c of existingCategories) {
          categoryMap.set(c.name.toLowerCase(), c.id);
        }

        if (dto.categories?.length) {
          for (const catDto of dto.categories) {
            const code = catDto.code.toUpperCase();

            // Check by code
            let parent = await tx.category.findUnique({ where: { code } });
            if (parent) {
              report.categories.skipped.push(catDto.name);
              categoryMap.set(catDto.name.toLowerCase(), parent.id);
            } else {
              parent = await tx.category.create({
                data: { name: catDto.name, code },
              });
              report.categories.created.push(catDto.name);
              categoryMap.set(catDto.name.toLowerCase(), parent.id);
            }

            // Subcategories
            if (catDto.subcategories?.length) {
              for (const subName of catDto.subcategories) {
                const existingSub = await tx.category.findFirst({
                  where: { name: subName, parentId: parent.id },
                });
                if (existingSub) {
                  report.categories.skipped.push(subName);
                  categoryMap.set(subName.toLowerCase(), existingSub.id);
                } else {
                  const sub = await tx.category.create({
                    data: { name: subName, parentId: parent.id },
                  });
                  report.categories.created.push(subName);
                  categoryMap.set(subName.toLowerCase(), sub.id);
                }
              }
            }
          }
        }

        // ── 2. Brands ────────────────────────────────────────────────
        const brandMap = new Map<string, string>(); // name (lower) -> id

        const existingBrands = await tx.brand.findMany();
        for (const b of existingBrands) {
          brandMap.set(b.name.toLowerCase(), b.id);
        }

        if (dto.brands?.length) {
          for (const brandDto of dto.brands) {
            const existing = brandMap.get(brandDto.name.toLowerCase());
            if (existing) {
              report.brands.skipped.push(brandDto.name);
            } else {
              const brand = await tx.brand.create({
                data: { name: brandDto.name },
              });
              report.brands.created.push(brandDto.name);
              brandMap.set(brandDto.name.toLowerCase(), brand.id);
            }
          }
        }

        // ── 3. Suppliers ─────────────────────────────────────────────
        const supplierMap = new Map<string, string>(); // name (lower) -> id

        const existingSuppliers = await tx.supplier.findMany();
        for (const s of existingSuppliers) {
          supplierMap.set(s.name.toLowerCase(), s.id);
        }

        if (dto.suppliers?.length) {
          for (const supDto of dto.suppliers) {
            // Check by name or rif
            let existing = supplierMap.get(supDto.name.toLowerCase());
            if (!existing && supDto.rif) {
              const byRif = await tx.supplier.findFirst({
                where: { rif: supDto.rif },
              });
              if (byRif) existing = byRif.id;
            }

            if (existing) {
              report.suppliers.skipped.push(supDto.name);
              supplierMap.set(supDto.name.toLowerCase(), existing);
            } else {
              const supplier = await tx.supplier.create({
                data: {
                  name: supDto.name,
                  rif: supDto.rif,
                  phone: supDto.phone,
                  email: supDto.email,
                  address: supDto.address,
                  contactName: supDto.contactName,
                },
              });
              report.suppliers.created.push(supDto.name);
              supplierMap.set(supDto.name.toLowerCase(), supplier.id);
            }
          }
        }

        // ── 4. Products ──────────────────────────────────────────────

        // Get CompanyConfig for bregaGlobalPct
        const config = await tx.companyConfig.findUnique({
          where: { id: 'singleton' },
        });
        const bregaGlobalPct = config?.bregaGlobalPct ?? 0;

        if (dto.products?.length) {
          for (const prodDto of dto.products) {
            try {
              // Check if product already exists by code or name
              if (prodDto.code) {
                const byCode = await tx.product.findUnique({
                  where: { code: prodDto.code },
                });
                if (byCode) {
                  report.products.skipped.push(prodDto.name);
                  continue;
                }
              }

              const byName = await tx.product.findFirst({
                where: { name: { equals: prodDto.name, mode: 'insensitive' } },
              });
              if (byName) {
                report.products.skipped.push(prodDto.name);
                continue;
              }

              // Resolve category
              let categoryId: string | null = null;
              let categoryCode: string | null = null;

              if (prodDto.subcategory) {
                // Find parent category first to scope the subcategory search
                const parentId = categoryMap.get(prodDto.category.toLowerCase());
                if (!parentId) {
                  report.products.errors.push(
                    `${prodDto.name}: categoria "${prodDto.category}" no encontrada`,
                  );
                  continue;
                }
                categoryId = categoryMap.get(prodDto.subcategory.toLowerCase()) || null;
                if (!categoryId) {
                  report.products.errors.push(
                    `${prodDto.name}: subcategoria "${prodDto.subcategory}" no encontrada`,
                  );
                  continue;
                }
                // Get the parent category code for product code generation
                const parentCat = await tx.category.findUnique({
                  where: { id: parentId },
                });
                categoryCode = parentCat?.code || null;
              } else if (prodDto.category) {
                categoryId = categoryMap.get(prodDto.category.toLowerCase()) || null;
                if (!categoryId) {
                  report.products.errors.push(
                    `${prodDto.name}: categoria "${prodDto.category}" no encontrada`,
                  );
                  continue;
                }
                const cat = await tx.category.findUnique({
                  where: { id: categoryId },
                });
                categoryCode = cat?.code || null;
                // If category has a parent, get the parent code for product code generation
                if (cat?.parentId) {
                  const parentCat = await tx.category.findUnique({
                    where: { id: cat.parentId },
                  });
                  categoryCode = parentCat?.code || categoryCode;
                }
              }

              // Resolve brand
              let brandId: string | null = null;
              if (prodDto.brand) {
                brandId = brandMap.get(prodDto.brand.toLowerCase()) || null;
                if (!brandId) {
                  report.products.errors.push(
                    `${prodDto.name}: marca "${prodDto.brand}" no encontrada`,
                  );
                  continue;
                }
              }

              // Resolve supplier
              let supplierId: string | null = null;
              if (prodDto.supplier) {
                supplierId = supplierMap.get(prodDto.supplier.toLowerCase()) || null;
                if (!supplierId) {
                  report.products.errors.push(
                    `${prodDto.name}: proveedor "${prodDto.supplier}" no encontrado`,
                  );
                  continue;
                }
              }

              // Generate product code if not provided
              let productCode = prodDto.code;
              if (!productCode) {
                if (!categoryCode) {
                  report.products.errors.push(
                    `${prodDto.name}: no se puede generar codigo sin categoria con codigo`,
                  );
                  continue;
                }

                // Find the root category (with the code) to increment lastProductNumber
                const rootCat = await tx.category.findUnique({
                  where: { code: categoryCode },
                });
                if (!rootCat) {
                  report.products.errors.push(
                    `${prodDto.name}: categoria raiz con codigo "${categoryCode}" no encontrada`,
                  );
                  continue;
                }

                // Atomic increment using raw SQL SELECT FOR UPDATE to avoid race conditions
                const [updated] = await tx.$queryRaw<
                  { lastProductNumber: number }[]
                >`
                  UPDATE "Category"
                  SET "lastProductNumber" = "lastProductNumber" + 1
                  WHERE id = ${rootCat.id}
                  RETURNING "lastProductNumber"
                `;

                const nextNumber = updated.lastProductNumber;
                productCode = `${categoryCode}${nextNumber.toString().padStart(5, '0')}`;
              }

              // Check barcode uniqueness
              if (prodDto.barcode) {
                const byBarcode = await tx.product.findUnique({
                  where: { barcode: prodDto.barcode },
                });
                if (byBarcode) {
                  report.products.errors.push(
                    `${prodDto.name}: codigo de barras "${prodDto.barcode}" ya existe`,
                  );
                  continue;
                }
              }

              // Calculate prices
              const costUsd = prodDto.costUsd ?? 0;
              const gananciaPct = prodDto.gananciaPct ?? 0;
              const gananciaMayorPct = prodDto.gananciaMayorPct ?? 0;
              const ivaType = prodDto.ivaType ?? IvaType.GENERAL;
              const bregaApplies = prodDto.bregaApplies !== false;
              const bregaPct = bregaApplies ? bregaGlobalPct : 0;
              const ivaMultiplier = IVA_MULTIPLIERS[ivaType];

              const priceDetal =
                Math.round(
                  costUsd * (1 + bregaPct / 100) * (1 + gananciaPct / 100) * ivaMultiplier * 100,
                ) / 100;
              const priceMayor =
                Math.round(
                  costUsd * (1 + bregaPct / 100) * (1 + gananciaMayorPct / 100) * ivaMultiplier * 100,
                ) / 100;

              // Create the product
              await tx.product.create({
                data: {
                  code: productCode,
                  barcode: prodDto.barcode || null,
                  supplierRef: prodDto.supplierRef || null,
                  name: prodDto.name,
                  description: prodDto.description || null,
                  categoryId,
                  brandId,
                  supplierId,
                  purchaseUnit: prodDto.purchaseUnit ?? 'UNIT',
                  saleUnit: prodDto.saleUnit ?? 'UNIT',
                  conversionFactor: prodDto.conversionFactor ?? 1,
                  costUsd,
                  bregaApplies,
                  gananciaPct,
                  gananciaMayorPct,
                  ivaType,
                  priceDetal,
                  priceMayor,
                  minStock: prodDto.minStock ?? 0,
                },
              });

              report.products.created.push(prodDto.name);
            } catch (err: any) {
              this.logger.error(`Error importing product "${prodDto.name}": ${err.message}`);
              report.products.errors.push(`${prodDto.name}: ${err.message}`);
            }
          }
        }

        return report;
      },
      { timeout: 60_000 },
    );
  }
}
