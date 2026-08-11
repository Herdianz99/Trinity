import { PrismaService } from '../prisma/prisma.service';

/**
 * Construye un mapa categoryId -> brecha de su categoría RAÍZ.
 * Camina parentId hasta la raíz (memoizado). Las categorías son pocas (decenas): 1 sola query.
 * Uso: en cada call-site, categoryBregaPct = map.get(product.categoryId) ?? 0.
 */
export async function buildCategoryBregaMap(prisma: PrismaService): Promise<Map<string, number>> {
  const cats = await prisma.category.findMany({
    select: { id: true, parentId: true, bregaPct: true },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const cache = new Map<string, number>();

  function rootBrega(id: string | null): number {
    if (!id) return 0;
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
    const c = byId.get(id);
    if (!c) return 0;
    // guard anti-ciclo: marca provisional en 0 mientras resuelve el padre
    cache.set(id, 0);
    const val = c.parentId ? rootBrega(c.parentId) : (c.bregaPct || 0);
    cache.set(id, val);
    return val;
  }

  const map = new Map<string, number>();
  for (const c of cats) map.set(c.id, rootBrega(c.id));
  return map;
}
