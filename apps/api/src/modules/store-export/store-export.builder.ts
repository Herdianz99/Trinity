// Lógica PURA del snapshot de la tienda: sin NestJS, sin Prisma, sin Spaces.
// Testeable en aislamiento (ver _verify-store-export.ts).

const LOW_STOCK_THRESHOLD = 5; // "pocas unidades" si stock total <= este valor

export type StockStatus = 'disponible' | 'pocas' | 'agotado';

export interface StoreProduct {
  slug: string;
  code: string;
  name: string;
  description: string;
  priceUsd: number;
  priceBs: number;
  stockStatus: StockStatus;
  image: string | null;
  thumb: string | null;
  categorySlug: string | null;
  brandSlug: string | null;
  featured: boolean;
}

/** Forma cruda de producto que espera el builder (subset del select de Prisma). */
export interface RawProduct {
  code: string;
  name: string;
  description: string | null;
  priceDetal: number;
  storeFeatured: boolean;
  primaryImageThumbUrl: string | null;
  primaryImageMediumUrl: string | null;
  category: { name: string } | null;
  brand: { name: string } | null;
  stock: { quantity: number }[];
}

export interface SnapshotBuild {
  catalog: { generatedAt: string; rate: number; products: StoreProduct[] };
  meta: {
    generatedAt: string;
    rate: number;
    categories: { slug: string; name: string; productCount: number }[];
    brands: { slug: string; name: string; productCount: number }[];
  };
  summary: { products: number; categories: number; brands: number; generatedAt: string };
}

/** Convierte texto a slug: minúsculas, sin acentos, no-alfanumérico → guion. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (combining diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Construye los payloads del snapshot (catalog.json + meta.json) a partir de los
 * productos ya consultados. Función PURA (sin BD ni Spaces) → testeable en aislamiento.
 */
export function buildSnapshotData(products: RawProduct[], rate: number, generatedAt: string): SnapshotBuild {
  // Slugs de categoría/marca con dedupe determinista.
  const catSlugs = new Map<string, string>(); // name -> slug
  const brandSlugs = new Map<string, string>();
  const used = new Set<string>();
  const uniqueSlug = (base: string): string => {
    let s = base || 'x';
    let n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    return s;
  };
  const catCount = new Map<string, number>();
  const brandCount = new Map<string, number>();

  const storeProducts: StoreProduct[] = products.map((p) => {
    const total = p.stock.reduce((sum, s) => sum + s.quantity, 0);
    const stockStatus: StockStatus =
      total <= 0 ? 'agotado' : total <= LOW_STOCK_THRESHOLD ? 'pocas' : 'disponible';

    let categorySlug: string | null = null;
    if (p.category?.name) {
      if (!catSlugs.has(p.category.name)) {
        catSlugs.set(p.category.name, uniqueSlug(slugify(p.category.name)));
      }
      categorySlug = catSlugs.get(p.category.name)!;
      catCount.set(categorySlug, (catCount.get(categorySlug) || 0) + 1);
    }
    let brandSlug: string | null = null;
    if (p.brand?.name) {
      if (!brandSlugs.has(p.brand.name)) {
        brandSlugs.set(p.brand.name, uniqueSlug(slugify(p.brand.name)));
      }
      brandSlug = brandSlugs.get(p.brand.name)!;
      brandCount.set(brandSlug, (brandCount.get(brandSlug) || 0) + 1);
    }

    return {
      slug: `${slugify(p.name)}-${p.code.toLowerCase()}`,
      code: p.code,
      name: p.name,
      description: p.description ?? '',
      priceUsd: p.priceDetal,
      priceBs: Math.round(p.priceDetal * rate * 100) / 100,
      stockStatus,
      image: p.primaryImageMediumUrl ?? null,
      thumb: p.primaryImageThumbUrl ?? null,
      categorySlug,
      brandSlug,
      featured: p.storeFeatured,
    };
  });

  const categories = Array.from(catSlugs.entries()).map(([name, slug]) => ({
    slug,
    name,
    productCount: catCount.get(slug) || 0,
  }));
  const brands = Array.from(brandSlugs.entries()).map(([name, slug]) => ({
    slug,
    name,
    productCount: brandCount.get(slug) || 0,
  }));

  return {
    catalog: { generatedAt, rate, products: storeProducts },
    meta: { generatedAt, rate, categories, brands },
    summary: {
      products: storeProducts.length,
      categories: categories.length,
      brands: brands.length,
      generatedAt,
    },
  };
}
