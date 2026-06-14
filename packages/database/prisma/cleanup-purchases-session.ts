/**
 * ============================================================================
 *  SCRIPT DE UN SOLO USO — Limpieza de facturas de COMPRA cargadas para recargar
 * ============================================================================
 *
 *  Borra TODAS las compras (PurchaseOrder) y lo derivado simple (CxP, items),
 *  revirtiendo el inventario que agregaron. Las compras mueven inventario con
 *  StockMovement type PURCHASE (reference = nº de compra "FC-XXXXX"); revertir
 *  es Stock.quantity -= quantity (quantity positiva -> resta el stock agregado).
 *
 *  NO toca la carga inicial de inventario (esos son ADJUSTMENT_IN).
 *  El correlativo de compra (FC-XXXXX) es MAX(purchaseNumber)+1, así que al
 *  borrar todas, la próxima compra arranca sola desde FC-00001 (no hay contador
 *  que resetear).
 *
 *  SEGURIDAD — este script SOLO maneja el caso simple (compras sin retenciones,
 *  notas, pagos ni libro). Si encuentra cualquiera de esos datos, ABORTA y pide
 *  revisión manual (salvo FORCE=1), porque involucran numeración fiscal delicada
 *  (RetentionVoucher / IslrRetentionVoucher / CompanyConfig.retentionNextNumber).
 *
 *    - Por defecto DRY RUN: solo reporta.
 *    - Borrado real: CONFIRM=DELETE_ALL_PURCHASES
 *
 *  USO (servidor, /opt/Trinity):
 *    export DATABASE_URL="$(grep '^DATABASE_URL=' packages/database/.env | cut -d= -f2-)"
 *    pnpm --filter @trinity/database exec tsx prisma/cleanup-purchases-session.ts            # dry run
 *    CONFIRM=DELETE_ALL_PURCHASES pnpm --filter @trinity/database exec tsx prisma/cleanup-purchases-session.ts
 *
 *  >>> BORRAR ESTE ARCHIVO DESPUÉS DE USARLO <<<
 * ============================================================================
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CONFIRM = process.env.CONFIRM === 'DELETE_ALL_PURCHASES';
const FORCE = process.env.FORCE === '1';
const log = (...a: any[]) => console.log(...a);

async function main() {
  log('========================================================');
  log('  LIMPIEZA DE FACTURAS DE COMPRA (script de un solo uso)');
  log('  Modo:', CONFIRM ? '*** BORRADO REAL ***' : 'DRY RUN (no borra nada)');
  log('========================================================\n');

  const orders = await prisma.purchaseOrder.findMany({
    select: { id: true, number: true, status: true },
  });
  const orderIds = orders.map((o) => o.id);
  const orderNumbers = orders.map((o) => o.number).filter(Boolean) as string[];

  if (orderIds.length === 0) {
    log('No hay compras (PurchaseOrder). Nada que hacer.');
    return;
  }

  const payables = await prisma.payable.findMany({ where: { purchaseOrderId: { in: orderIds } }, select: { id: true } });
  const payableIds = payables.map((p) => p.id);

  // Movimientos de inventario de compra a revertir
  const purchaseMovements = await prisma.stockMovement.findMany({
    where: { type: 'PURCHASE', reference: { in: orderNumbers } },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });

  // Conteos / chequeos de seguridad (cosas que el script NO maneja)
  const [
    itemCount, payablePayments, ivaRetentions, retVouchers, islrVouchers,
    purchaseBook, notes, receiptItemsCxp, schedCxp,
  ] = await Promise.all([
    prisma.purchaseOrderItem.count({ where: { purchaseOrderId: { in: orderIds } } }),
    payableIds.length ? prisma.payablePayment.count({ where: { payableId: { in: payableIds } } }) : Promise.resolve(0),
    prisma.ivaRetention.count({ where: { purchaseOrderId: { in: orderIds } } }),
    prisma.retentionVoucherLine.count({ where: { purchaseOrderId: { in: orderIds } } }),
    prisma.islrRetentionVoucherLine.count({ where: { purchaseOrderId: { in: orderIds } } }),
    prisma.purchaseBookEntry.count({ where: { purchaseOrderId: { in: orderIds } } }),
    prisma.creditDebitNote.count({ where: { purchaseOrderId: { in: orderIds } } }),
    payableIds.length ? prisma.receiptItem.count({ where: { payableId: { in: payableIds } } }) : Promise.resolve(0),
    payableIds.length ? prisma.paymentScheduleItem.count({ where: { payableId: { in: payableIds } } }) : Promise.resolve(0),
  ]);

  // Reporte
  log('--- COMPRAS ---');
  log(`  PurchaseOrder:       ${orders.length}  (PROCESSED ${orders.filter(o => o.status === 'PROCESSED').length}, ` +
      `otras ${orders.filter(o => o.status !== 'PROCESSED').length})`);
  log(`  PurchaseOrderItem:   ${itemCount}`);
  log(`  Payable (CxP):       ${payables.length}`);
  log(`  StockMovement PURCHASE: ${purchaseMovements.length}  (se revierten -> resta stock)`);
  log('--- DATOS QUE EL SCRIPT NO MANEJA (deben ser 0) ---');
  log(`  PayablePayment: ${payablePayments} | IvaRetention: ${ivaRetentions} | RetVoucherLine: ${retVouchers} | ` +
      `IslrVoucherLine: ${islrVouchers} | PurchaseBookEntry: ${purchaseBook} | Notas: ${notes} | ` +
      `ReceiptItems CxP: ${receiptItemsCxp} | SchedItems CxP: ${schedCxp}`);
  log('');

  const blockers: string[] = [];
  if (payablePayments) blockers.push(`${payablePayments} pago(s) a proveedor`);
  if (ivaRetentions) blockers.push(`${ivaRetentions} retención(es) IVA`);
  if (retVouchers) blockers.push(`${retVouchers} línea(s) de comprobante de retención IVA`);
  if (islrVouchers) blockers.push(`${islrVouchers} línea(s) de retención ISLR`);
  if (purchaseBook) blockers.push(`${purchaseBook} entrada(s) de libro de compras`);
  if (notes) blockers.push(`${notes} nota(s) de compra (NCC/NDC)`);
  if (receiptItemsCxp) blockers.push(`${receiptItemsCxp} recibo(s) ligados a CxP`);
  if (schedCxp) blockers.push(`${schedCxp} programación(es) de pago ligadas a CxP`);

  if (blockers.length) {
    log('⚠️  Hay datos complejos que este script NO borra de forma segura:');
    blockers.forEach((b) => log('   - ' + b));
    log('\n❌ Abortado. Estos casos (retenciones/notas/pagos) tocan numeración fiscal y requieren manejo manual.');
    if (!FORCE) return;
    log('   FORCE=1: se continúa de todas formas (NO recomendado).\n');
  }

  if (!CONFIRM) {
    log('🟡 DRY RUN: no se borró nada. Verifica que las compras (16) sean lo esperado.');
    log('   Borrado real: CONFIRM=DELETE_ALL_PURCHASES pnpm --filter @trinity/database exec tsx prisma/cleanup-purchases-session.ts');
    return;
  }

  log('🔴 Ejecutando borrado real...\n');

  const decByPair = new Map<string, { productId: string; warehouseId: string; qty: number }>();
  for (const m of purchaseMovements) {
    const key = `${m.productId}::${m.warehouseId}`;
    const cur = decByPair.get(key) ?? { productId: m.productId, warehouseId: m.warehouseId, qty: 0 };
    cur.qty += m.quantity;
    decByPair.set(key, cur);
  }

  await prisma.$transaction(async (tx) => {
    for (const { productId, warehouseId, qty } of decByPair.values()) {
      await tx.stock.updateMany({ where: { productId, warehouseId }, data: { quantity: { decrement: qty } } });
    }
    log(`  ✔ Stock revertido en ${decByPair.size} par(es) producto/almacén`);

    const delMov = await tx.stockMovement.deleteMany({ where: { type: 'PURCHASE', reference: { in: orderNumbers } } });
    log(`  ✔ StockMovement (PURCHASE) borrados: ${delMov.count}`);

    const delPay = await tx.payable.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    const delItems = await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    const delOrders = await tx.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    log(`  ✔ Compras: ${delOrders.count} compra(s), ${delItems.count} item(s), ${delPay.count} CxP`);
  }, { timeout: 120_000 });

  log('\n✅ Listo. Compras eliminadas e inventario de compras revertido.');
  log('   La próxima compra arrancará desde FC-00001. Recuerda BORRAR este archivo.');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
