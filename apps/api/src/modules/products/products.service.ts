import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { productSearchTsQuery } from '../../common/product-search';
import { PriceAdjustmentQueryDto } from './dto/price-adjustment-query.dto';
import { ApplyPriceAdjustmentDto } from './dto/apply-price-adjustment.dto';
import { PurchaseAnalysisDto } from './dto/purchase-analysis.dto';
import { IvaType, Prisma } from '@prisma/client';
import { caracasDayStart, caracasDayEnd, caracasDateKey } from '../../common/timezone';
import { StoreExportService } from '../store-export/store-export.service';
import { IntegrationService } from '../integration/integration.service';
import { resolveBregaPct, computeSellingPrices } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';

const IVA_MULTIPLIERS: Record<IvaType, number> = {
  EXEMPT: 1,
  REDUCED: 1.08,
  GENERAL: 1.16,
  SPECIAL: 1.31,
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private storeExport: StoreExportService,
    private integration: IntegrationService,
  ) {}

  // Analisis de compra: productos (filtrables por categoria/marca/proveedor) con su existencia
  // total y el total vendido en un periodo. "vendido" = suma neta (quantity - returnedQty) de
  // los items de facturas cobradas (PAID/PARTIAL_RETURN/RETURNED) cuyo paidAt cae en el rango
  // (dia-calendario Caracas). Por defecto lista TODOS los productos del filtro; onlyWithSales
  // deja solo los que tuvieron ventas.
  async purchaseAnalysis(dto: PurchaseAnalysisDto) {
    const where: Prisma.ProductWhereInput = {};
    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.brandId) where.brandId = dto.brandId;
    if (dto.supplierId) where.supplierId = dto.supplierId;

    // Búsqueda por artículo específico: código, nombre, ref. proveedor o código de barras.
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { supplierRef: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const from = caracasDayStart(dto.from);
    const to = caracasDayEnd(dto.to);

    // Productos del filtro, con su existencia (suma de stock en todos los almacenes).
    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        code: true,
        supplierRef: true,
        name: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        supplier: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Vendido por producto en el periodo (una sola agregacion; devuelve solo los que vendieron).
    const soldGrouped = await this.prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: {
        invoice: {
          status: { in: ['PAID', 'PARTIAL_RETURN', 'RETURNED'] },
          paidAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true, returnedQty: true },
    });
    const soldMap = new Map<string, number>();
    for (const g of soldGrouped) {
      const net = Math.round(((g._sum.quantity || 0) - (g._sum.returnedQty || 0)) * 1000) / 1000;
      soldMap.set(g.productId, net);
    }

    let rows = products.map((p) => ({
      code: p.code,
      supplierRef: p.supplierRef || null,
      name: p.name,
      category: p.category?.name || null,
      brand: p.brand?.name || null,
      supplier: p.supplier?.name || null,
      stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
      sold: soldMap.get(p.id) || 0,
    }));

    if (dto.onlyWithSales === 'true') rows = rows.filter((r) => r.sold > 0);

    return {
      from: dto.from,
      to: dto.to,
      onlyWithSales: dto.onlyWithSales === 'true',
      totalProducts: rows.length,
      totalSold: Math.round(rows.reduce((s, r) => s + r.sold, 0) * 1000) / 1000,
      rows,
    };
  }

  private async calculatePrices(
    costUsd: number,
    gananciaPct: number,
    gananciaMayorPct: number,
    ivaType: IvaType,
    bregaApplies: boolean,
    categoryBregaPct: number, // brecha de la categoría RAÍZ del producto (0 si no tiene)
  ) {
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const bregaPct = resolveBregaPct({
      bregaApplies,
      categoryBregaPct,
      bregaGlobalPct: config?.bregaGlobalPct || 0,
    });
    return computeSellingPrices({
      costUsd,
      gananciaPct,
      gananciaMayorPct,
      ivaMultiplier: IVA_MULTIPLIERS[ivaType],
      bregaPct,
    });
  }

  private async generateCodeFromCategory(categoryId: string): Promise<string> {
    // Use SELECT FOR UPDATE to safely increment correlative
    const result = await this.prisma.$queryRaw<any[]>`
      UPDATE "Category"
      SET "lastProductNumber" = "lastProductNumber" + 1
      WHERE id = ${categoryId}
      RETURNING code, "lastProductNumber"
    `;
    if (!result[0]?.code) {
      throw new ConflictException('La categoria no tiene codigo asignado');
    }
    return `${result[0].code}${String(result[0].lastProductNumber).padStart(5, '0')}`;
  }

  async create(dto: CreateProductDto) {
    if (dto.barcode) {
      const existing = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (existing) throw new ConflictException('El codigo de barras ya existe');
    }

    let code = dto.code;
    if (!code) {
      if (!dto.categoryId) {
        throw new BadRequestException('Se requiere categoria para generar el codigo automaticamente');
      }
      code = await this.generateCodeFromCategory(dto.categoryId);
    } else {
      const existingCode = await this.prisma.product.findUnique({ where: { code } });
      if (existingCode) throw new ConflictException('El codigo de producto ya existe');
    }

    // Use company defaults if ganancia not specified
    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const gananciaPct = dto.gananciaPct ?? config?.defaultGananciaPct ?? 0;
    const gananciaMayorPct = dto.gananciaMayorPct ?? config?.defaultGananciaMayorPct ?? 0;

    let priceDetal: number;
    let priceMayor: number;

    if (dto.manualPrice) {
      // Manual price: use the provided prices directly (IVA included)
      priceDetal = dto.priceDetal ?? 0;
      priceMayor = dto.priceMayor ?? priceDetal;
    } else {
      const catMap = await buildCategoryBregaMap(this.prisma);
      const categoryBregaPct = dto.categoryId ? (catMap.get(dto.categoryId) ?? 0) : 0;
      const prices = await this.calculatePrices(
        dto.costUsd || 0,
        gananciaPct,
        gananciaMayorPct,
        dto.ivaType || IvaType.GENERAL,
        dto.bregaApplies !== false,
        categoryBregaPct,
      );
      priceDetal = prices.priceDetal;
      priceMayor = prices.priceMayor;
    }

    const created = await this.prisma.product.create({
      data: {
        ...dto,
        code,
        gananciaPct,
        gananciaMayorPct,
        priceDetal,
        priceMayor,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    this.storeExport.scheduleExport(); // republica el snapshot de la tienda
    void this.integration.pushNewProduct(created.id); // sync del alta al socio (async, no bloquea)
    return created;
  }

  // Construye el `where` compartido por findAll y el reporte PDF de existencias.
  // Devuelve null cuando el filtro garantiza 0 resultados (search / inStock sin coincidencias).
  private async buildListWhere(query: QueryProductsDto): Promise<Prisma.ProductWhereInput | null> {
    const { categoryId, brandId, supplierId, search, lowStock, inStock, isActive, includeInactive, saleBlocked, isOnSale } = query;

    const where: Prisma.ProductWhereInput = {};

    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (supplierId) where.supplierId = supplierId;
    // Por defecto solo productos activos (POS, ventas, ajustes, etc. no ven los desactivados).
    // El catalogo /catalog/products pasa includeInactive=true para gestionarlos; isActive explicito manda.
    if (isActive !== undefined) where.isActive = isActive;
    else if (!includeInactive) where.isActive = true;
    // Filtro del catalogo: solo productos bloqueados para la venta.
    if (saleBlocked) where.saleBlocked = true;
    // Filtro del catalogo: solo productos en oferta.
    if (isOnSale) where.isOnSale = true;

    if (lowStock) {
      where.stock = {
        every: {
          quantity: { lte: 0 },
        },
      };
      // Use raw query approach for low stock filter
      where.AND = [
        {
          OR: [
            { stock: { none: {} } },
            {
              minStock: { gt: 0 },
            },
          ],
        },
      ];
    }

    // Full-text search using raw SQL if search term provided.
    // to_tsquery con prefijos (palabra:*) exige TODAS las palabras en cualquier orden;
    // el ILIKE sobre codigos queda como respaldo para busquedas exactas por codigo.
    if (search) {
      const tsq = productSearchTsQuery(search);
      const like = `%${search}%`;
      const searchResults = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "searchVector" @@ to_tsquery('spanish', ${tsq})
        OR code ILIKE ${like}
        OR barcode ILIKE ${like}
        OR "supplierRef" ILIKE ${like}
        OR "otherCode" ILIKE ${like}
      `;
      const ids = searchResults.map((r) => r.id);
      if (ids.length === 0) return null;
      where.id = { in: ids };
    }

    // For low stock, use a different approach
    if (lowStock && !search) {
      delete where.stock;
      delete where.AND;
      // Get products where total stock < minStock
      const lowStockProducts = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p
        LEFT JOIN (
          SELECT "productId", COALESCE(SUM(quantity), 0) as total_stock
          FROM "Stock"
          GROUP BY "productId"
        ) s ON s."productId" = p.id
        WHERE COALESCE(s.total_stock, 0) < p."minStock"
        AND p."isActive" = true
      `;
      const ids = lowStockProducts.map((r) => r.id);
      if (ids.length === 0) return null;
      where.id = where.id ? { in: [...new Set([...(where.id as any).in || [], ...ids])] } : { in: ids };
    }

    // Solo articulos con existencia: suma de stock por producto > 0 (misma definicion que
    // la pantalla). Se intersecta con los ids ya filtrados por search si aplica.
    if (inStock) {
      const inStockRows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p
        JOIN (
          SELECT "productId", COALESCE(SUM(quantity), 0) as total_stock
          FROM "Stock"
          GROUP BY "productId"
        ) s ON s."productId" = p.id
        WHERE s.total_stock > 0
      `;
      const stockIds = inStockRows.map((r) => r.id);
      if (stockIds.length === 0) return null;
      const existing = (where.id as any)?.in as string[] | undefined;
      if (existing) {
        const stockSet = new Set(stockIds);
        const inter = existing.filter((id) => stockSet.has(id));
        if (inter.length === 0) return null;
        where.id = { in: inter };
      } else {
        where.id = { in: stockIds };
      }
    }

    return where;
  }

  async findAll(query: QueryProductsDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = await this.buildListWhere(query);
    if (!where) return { data: [], total: 0, page, limit, totalPages: 0 };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        // Solo el POS pide ofertas de primero (onSaleFirst); el resto (catálogo, etc.) va alfabético.
        orderBy: query.onSaleFirst ? [{ isOnSale: 'desc' }, { name: 'asc' }] : { name: 'asc' },
        include: {
          category: { include: { printArea: { select: { id: true, name: true } } } },
          brand: true,
          supplier: { select: { id: true, name: true } },
          stock: { include: { warehouse: { select: { id: true, name: true, countsForSale: true } } } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Lista completa (sin paginar) para el reporte PDF de existencias. Aplica los mismos
  // filtros que findAll (search, inStock, etc.) y devuelve solo los campos del reporte.
  async reportList(query: QueryProductsDto) {
    const where = await this.buildListWhere(query);
    if (!where) return [];

    const products = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        code: true,
        supplierRef: true,
        name: true,
        stock: { select: { quantity: true } },
      },
    });

    return products.map((p) => ({
      code: p.code,
      supplierRef: p.supplierRef,
      name: p.name,
      stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
    }));
  }

  // Lista de articulos SIN foto para el reporte de la sesion de fotos. Filtro opcional por
  // marca. Sin foto = no tiene ninguna fila en ProductImage (fuente de verdad). Se ordena
  // agrupado por marca (alfabetico) y dentro de cada marca por existencia de mayor a menor,
  // ya que a un articulo sin existencia no se le pueden tomar fotos.
  async noPhotoReportList(brandId?: string) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      images: { none: {} },
    };
    if (brandId) where.brandId = brandId;

    const products = await this.prisma.product.findMany({
      where,
      select: {
        code: true,
        supplierRef: true,
        name: true,
        brand: { select: { name: true } },
        stock: { select: { quantity: true } },
      },
    });

    return products
      .map((p) => ({
        code: p.code,
        supplierRef: p.supplierRef,
        name: p.name,
        brand: p.brand?.name || 'Sin marca',
        stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
      }))
      .sort((a, b) => {
        if (a.brand !== b.brand) return a.brand.localeCompare(b.brand, 'es');
        return b.stock - a.stock;
      });
  }

  // Lista completa (sin paginar) para el reporte del catalogo (Excel/PDF). Aplica los mismos
  // filtros que la pantalla /catalog/products (search, categoria, marca, proveedor, stock bajo,
  // solo desactivados, solo bloqueados para venta) e incluye precio, estado y tasa del dia.
  async catalogReportList(query: QueryProductsDto) {
    const where = await this.buildListWhere(query);
    const today = caracasDateKey();
    const [rateRow, products] = await Promise.all([
      this.prisma.exchangeRate.findUnique({ where: { date: today } }),
      where
        ? this.prisma.product.findMany({
            where,
            orderBy: { name: 'asc' },
            select: {
              code: true,
              supplierRef: true,
              name: true,
              costUsd: true,
              priceDetal: true,
              priceMayor: true,
              isActive: true,
              saleBlocked: true,
              category: { select: { name: true } },
              brand: { select: { name: true } },
              supplier: { select: { name: true } },
              stock: { select: { quantity: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const rate = rateRow?.rate || 0;
    const items = products.map((p) => ({
      code: p.code,
      supplierRef: p.supplierRef || '',
      name: p.name,
      category: p.category?.name || '',
      brand: p.brand?.name || '',
      supplier: p.supplier?.name || '',
      cost: p.costUsd,
      priceDetal: p.priceDetal,
      priceMayor: p.priceMayor,
      priceDetalBs: Math.round(p.priceDetal * rate * 100) / 100,
      stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
      status: !p.isActive ? 'Inactivo' : p.saleBlocked ? 'Bloq. venta' : 'Activo',
    }));

    return { items, rate };
  }

  async search(q: string) {
    if (!q || q.trim().length === 0) return [];

    const tsq = productSearchTsQuery(q);
    const like = `%${q}%`;
    const results = await this.prisma.$queryRaw<any[]>`
      SELECT p.id, p.code, p.name, p."priceDetal", p."priceMayor", p."isService",
        p."primaryImageThumbUrl", p."isOnSale",
        COALESCE((SELECT SUM(s.quantity) FROM "Stock" s WHERE s."productId" = p.id), 0) as "totalStock"
      FROM "Product" p
      WHERE p."isActive" = true
      AND (
        p."searchVector" @@ to_tsquery('spanish', ${tsq})
        OR p.code ILIKE ${like}
        OR p.barcode ILIKE ${like}
        OR p."supplierRef" ILIKE ${like}
        OR p."otherCode" ILIKE ${like}
      )
      ORDER BY
        p."isOnSale" DESC,
        CASE WHEN p.code ILIKE ${like} THEN 0
             WHEN p.barcode = ${q} THEN 0
             ELSE 1
        END,
        p.name ASC
      LIMIT 100
    `;

    return results.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      priceDetal: Number(r.priceDetal),
      priceMayor: Number(r.priceMayor),
      totalStock: Number(r.totalStock),
      isService: r.isService,
      isOnSale: r.isOnSale ?? false,
      primaryImageThumbUrl: r.primaryImageThumbUrl ?? null,
    }));
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async findByCode(code: string) {
    const product = await this.prisma.product.findUnique({
      where: { code },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async findPurchaseHistory(productId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { productId };
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrderItem.findMany({
        where,
        include: {
          purchaseOrder: {
            include: {
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { purchaseOrder: { createdAt: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrderItem.count({ where }),
    ]);
    return {
      data: items.map((item) => ({
        id: item.id,
        date: item.purchaseOrder.createdAt,
        orderNumber: item.purchaseOrder.number,
        orderId: item.purchaseOrder.id,
        status: item.purchaseOrder.status,
        supplier: item.purchaseOrder.supplier.name,
        quantity: item.receivedQty,
        costUsd: item.costUsd,
        totalUsd: item.totalUsd,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(id);

    if (dto.barcode && dto.barcode !== existing.barcode) {
      const dup = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (dup && dup.id !== id) throw new ConflictException('El codigo de barras ya existe');
    }

    // Recalculate prices
    const isManual = dto.manualPrice ?? existing.manualPrice;
    const { code, ...updateData } = dto;

    // Barcode vacio ("" o solo espacios) => null. El campo es @unique: guardar "" haria
    // chocar a un segundo producto "sin codigo" contra el "" ya existente. null permite N sin codigo.
    if (updateData.barcode !== undefined) {
      updateData.barcode = (updateData.barcode || '').trim() || null;
    }

    let priceDetal: number;
    let priceMayor: number;

    if (isManual) {
      // Manual price: use provided prices or keep existing
      priceDetal = dto.priceDetal ?? existing.priceDetal;
      priceMayor = dto.priceMayor ?? existing.priceMayor;
    } else {
      const costUsd = dto.costUsd ?? existing.costUsd;
      const gananciaPct = dto.gananciaPct ?? existing.gananciaPct;
      const gananciaMayorPct = dto.gananciaMayorPct ?? existing.gananciaMayorPct;
      const ivaType = dto.ivaType ?? existing.ivaType;
      const bregaApplies = dto.bregaApplies ?? existing.bregaApplies;
      const catMap = await buildCategoryBregaMap(this.prisma);
      const categoryId = dto.categoryId ?? existing.categoryId;
      const categoryBregaPct = categoryId ? (catMap.get(categoryId) ?? 0) : 0;
      const prices = await this.calculatePrices(costUsd, gananciaPct, gananciaMayorPct, ivaType, bregaApplies, categoryBregaPct);
      priceDetal = prices.priceDetal;
      priceMayor = prices.priceMayor;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...updateData,
        priceDetal,
        priceMayor,
      },
      include: {
        category: true,
        brand: true,
        supplier: true,
        stock: { include: { warehouse: true } },
      },
    });
    this.storeExport.scheduleExport(); // republica el snapshot de la tienda
    return updated;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Producto desactivado' };
  }

  // Asigna/reemplaza el codigo de barras de un producto validando unicidad (para la Sesion de codigos de barras).
  async setBarcode(id: string, rawBarcode: string) {
    const barcode = (rawBarcode || '').trim();
    if (!barcode) throw new BadRequestException('El código de barras no puede estar vacío');

    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, barcode: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const clash = await this.prisma.product.findFirst({
      where: { barcode, NOT: { id } },
      select: { code: true, name: true },
    });
    if (clash) {
      throw new ConflictException(`Ese código ya está asignado a ${clash.code} - ${clash.name}`);
    }

    return this.prisma.product.update({
      where: { id },
      data: { barcode },
      select: { id: true, code: true, name: true, barcode: true },
    });
  }

  async importProducts(products: CreateProductDto[]) {
    const results = { created: 0, errors: [] as string[] };

    for (const dto of products) {
      try {
        await this.create(dto);
        results.created++;
      } catch (err: any) {
        results.errors.push(`${dto.name || dto.code}: ${err.message}`);
      }
    }

    return results;
  }

  private buildPriceAdjustmentWhere(query: PriceAdjustmentQueryDto): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.categoryId) {
      where.OR = [
        { categoryId: query.categoryId },
        { category: { parentId: query.categoryId } },
      ];
    }
    if (query.subcategoryId) {
      where.categoryId = query.subcategoryId;
      delete where.OR;
    }
    if (query.brandId) where.brandId = query.brandId;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.costMin !== undefined || query.costMax !== undefined) {
      where.costUsd = {};
      if (query.costMin !== undefined) (where.costUsd as any).gte = query.costMin;
      if (query.costMax !== undefined) (where.costUsd as any).lte = query.costMax;
    }
    if (query.bregaApplies === 'true') where.bregaApplies = true;
    else if (query.bregaApplies === 'false') where.bregaApplies = false;

    return where;
  }

  async findForPriceAdjustment(query: PriceAdjustmentQueryDto) {
    const where = this.buildPriceAdjustmentWhere(query);

    const products = await this.prisma.product.findMany({
      where,
      take: 5000,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        costUsd: true,
        gananciaPct: true,
        gananciaMayorPct: true,
        priceDetal: true,
        priceMayor: true,
        ivaType: true,
        bregaApplies: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return products;
  }

  // Lista para el REPORTE de utilidad (pantalla /catalog/price-adjustment). Respeta los
  // mismos filtros que la vista previa (categoria, subcategoria, marca, proveedor, brecha,
  // costo min/max) via buildPriceAdjustmentWhere, e incluye existencia + columnas derivadas
  // (costo+brecha, precio s/IVA) usando la MISMA formula del sistema.
  async utilidadReportList(query: PriceAdjustmentQueryDto) {
    const where = this.buildPriceAdjustmentWhere(query);
    const [config, products] = await Promise.all([
      this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ brand: { name: 'asc' } }, { gananciaPct: 'desc' }, { code: 'asc' }],
        select: {
          code: true,
          name: true,
          costUsd: true,
          gananciaPct: true,
          gananciaMayorPct: true,
          priceDetal: true,
          priceMayor: true,
          ivaType: true,
          bregaApplies: true,
          categoryId: true,
          category: { select: { name: true } },
          brand: { select: { name: true } },
          supplier: { select: { name: true } },
          stock: { select: { quantity: true } },
        },
      }),
    ]);

    const bregaGlobalPct = config?.bregaGlobalPct || 0;
    const catBregaMap = await buildCategoryBregaMap(this.prisma);
    const items = products.map((p) => {
      const bregaPct = resolveBregaPct({
        bregaApplies: p.bregaApplies,
        categoryBregaPct: p.categoryId ? (catBregaMap.get(p.categoryId) ?? 0) : 0,
        bregaGlobalPct,
      });
      const costoBrecha = Math.round(p.costUsd * (1 + bregaPct / 100) * 100) / 100;
      const ivaMult = IVA_MULTIPLIERS[p.ivaType];
      const precioSinIva = Math.round((p.priceDetal / ivaMult) * 100) / 100;
      return {
        code: p.code,
        name: p.name,
        brand: p.brand?.name || '',
        supplier: p.supplier?.name || '',
        category: p.category?.name || '',
        brega: p.bregaApplies,
        stock: Math.round(p.stock.reduce((s, x) => s + x.quantity, 0) * 1000) / 1000,
        cost: Math.round(p.costUsd * 100) / 100,
        costoBrecha,
        precioSinIva,
        gananciaPct: Math.round(p.gananciaPct * 100) / 100,
        gananciaMayorPct: Math.round(p.gananciaMayorPct * 100) / 100,
      };
    });
    return { items, bregaGlobalPct };
  }

  async applyPriceAdjustment(dto: ApplyPriceAdjustmentDto, userId: string) {
    // Si vienen productIds seleccionados, se ajustan SOLO esos. Si no, se cae al filtro (compatibilidad).
    const where: Prisma.ProductWhereInput =
      dto.productIds && dto.productIds.length > 0
        ? { id: { in: dto.productIds }, isActive: true }
        : this.buildPriceAdjustmentWhere(dto.filters);

    const catMap = await buildCategoryBregaMap(this.prisma);

    const result = await this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({ where });

      if (products.length === 0) {
        throw new BadRequestException('No hay productos seleccionados que coincidan');
      }

      const config = await tx.companyConfig.findUnique({
        where: { id: 'singleton' },
      });

      for (const product of products) {
        let newGananciaPct = product.gananciaPct;
        let newGananciaMayorPct = product.gananciaMayorPct;

        if (dto.gananciaPct !== undefined) {
          newGananciaPct = dto.adjustmentType === 'REPLACE'
            ? dto.gananciaPct
            : product.gananciaPct + dto.gananciaPct;
        }
        if (dto.gananciaMayorPct !== undefined) {
          newGananciaMayorPct = dto.adjustmentType === 'REPLACE'
            ? dto.gananciaMayorPct
            : product.gananciaMayorPct + dto.gananciaMayorPct;
        }

        // Ensure percentages don't go below 0
        if (newGananciaPct < 0) newGananciaPct = 0;
        if (newGananciaMayorPct < 0) newGananciaMayorPct = 0;

        const bregaPct = resolveBregaPct({
          bregaApplies: product.bregaApplies,
          categoryBregaPct: product.categoryId ? (catMap.get(product.categoryId) ?? 0) : 0,
          bregaGlobalPct: config?.bregaGlobalPct || 0,
        });
        const { priceDetal, priceMayor } = computeSellingPrices({
          costUsd: product.costUsd,
          gananciaPct: newGananciaPct,
          gananciaMayorPct: newGananciaMayorPct,
          ivaMultiplier: IVA_MULTIPLIERS[product.ivaType],
          bregaPct,
        });

        await tx.product.update({
          where: { id: product.id },
          data: {
            gananciaPct: newGananciaPct,
            gananciaMayorPct: newGananciaMayorPct,
            priceDetal,
            priceMayor,
          },
        });
      }

      const log = await tx.priceAdjustmentLog.create({
        data: {
          filters: dto.filters as any,
          adjustmentType: dto.adjustmentType,
          gananciaPct: dto.gananciaPct,
          gananciaMayorPct: dto.gananciaMayorPct,
          productsAffected: products.length,
          createdById: userId,
        },
      });

      return { productsAffected: products.length, log };
    }, { timeout: 60000 });
    this.storeExport.scheduleExport(); // republica el snapshot tras el ajuste masivo
    return result;
  }

  async getPriceAdjustmentHistory() {
    const logs = await this.prisma.priceAdjustmentLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Enrich with user names
    const userIds = [...new Set(logs.map((l) => l.createdById))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return logs.map((log) => ({
      ...log,
      createdByName: userMap.get(log.createdById) || 'Desconocido',
    }));
  }
}
