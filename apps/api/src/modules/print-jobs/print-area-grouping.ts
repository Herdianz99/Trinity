import { Prisma } from '@prisma/client';

export interface ComandaItemInput {
  productId: string;
  productName: string;
  quantity: number;
}

export interface PrintAreaGroup {
  printAreaId: string;
  items: { code: string; supplierRef: string; name: string; quantity: number }[];
}

/**
 * Agrupa ítems por `category.printArea`. Los ítems cuya categoría no tiene área
 * caen en el área marcada `isDefault` (o, si no hay ninguna default, la primera
 * área existente). Devuelve [] solo si NO existe ninguna PrintArea en el sistema.
 * Se usa tanto al cobrar una factura como al procesar comandas de una devolución.
 */
export async function buildPrintAreaGroups(
  tx: Prisma.TransactionClient,
  items: ComandaItemInput[],
): Promise<PrintAreaGroup[]> {
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { category: { include: { printArea: true } } },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // ¿Algún ítem sin área de categoría? Solo entonces resolvemos el fallback.
  const needFallback = items.some(
    (i) => !productMap.get(i.productId)?.category?.printAreaId,
  );
  let fallbackAreaId: string | null = null;
  if (needFallback) {
    const def = await tx.printArea.findFirst({ where: { isDefault: true } });
    fallbackAreaId =
      def?.id ??
      (await tx.printArea.findFirst({ orderBy: { createdAt: 'asc' } }))?.id ??
      null;
  }

  const groups: Record<string, PrintAreaGroup> = {};
  for (const item of items) {
    const product = productMap.get(item.productId);
    const areaId = product?.category?.printAreaId ?? fallbackAreaId;
    if (!areaId) continue; // no hay NINGUNA área en el sistema
    if (!groups[areaId]) groups[areaId] = { printAreaId: areaId, items: [] };
    groups[areaId].items.push({
      code: product?.code ?? '',
      supplierRef: product?.supplierRef ?? '',
      name: item.productName,
      quantity: item.quantity,
    });
  }
  return Object.values(groups);
}
