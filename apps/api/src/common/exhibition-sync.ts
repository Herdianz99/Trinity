import { Prisma } from '@prisma/client';

// Sincroniza la exhibición cuando cae la existencia de un producto (p.ej. tras una venta).
// Regla (Opción A "tope contra existencia"): la cantidad exhibida nunca puede superar la
// existencia física total. Si la existencia queda por debajo de lo exhibido, se baja lo
// exhibido hasta igualar la existencia y se registra ese diferencial como retiro AUTOMÁTICO
// (ExhibitionEntry REMOVED, reason SOLD, isAutomatic=true) para que salga marcado en el reporte.
//
// SIEMPRE llamarla DENTRO del $transaction que descuenta el stock, después del decremento,
// para que la suma de existencia ya refleje la venta. No sube nunca la exhibición (una
// devolución que reponga existencia NO re-exhibe: eso queda como acción manual).
export async function syncExhibitionAfterSale(
  tx: Prisma.TransactionClient,
  params: { productId: string; userId: string },
) {
  const product = await tx.product.findUnique({
    where: { id: params.productId },
    select: { id: true, isExhibited: true, exhibitedQuantity: true, exhibitionLocation: true },
  });
  if (!product || !product.isExhibited || product.exhibitedQuantity <= 0) return;

  // Existencia total del producto (todos los depósitos): la vitrina es física de la tienda.
  const agg = await tx.stock.aggregate({
    where: { productId: params.productId },
    _sum: { quantity: true },
  });
  const totalStock = agg._sum.quantity ?? 0;

  if (totalStock >= product.exhibitedQuantity) return; // la existencia aún cubre lo exhibido

  const newQty = Math.max(0, totalStock);
  const removed = product.exhibitedQuantity - newQty;
  if (removed <= 0) return;

  await tx.product.update({
    where: { id: product.id },
    data: {
      exhibitedQuantity: newQty,
      isExhibited: newQty > 0,
      // Al vaciar la vitrina se limpia el "desde" y la ubicación; si aún queda, se conservan.
      exhibitedSince: newQty > 0 ? undefined : null,
      exhibitionLocation: newQty > 0 ? undefined : null,
    },
  });

  await tx.exhibitionEntry.create({
    data: {
      productId: product.id,
      action: 'REMOVED',
      quantity: removed,
      isAutomatic: true,
      reason: 'SOLD',
      location: product.exhibitionLocation,
      note: 'Retiro automático: la existencia cayó por debajo de lo exhibido',
      createdById: params.userId,
    },
  });
}
