/**
 * ============================================================================
 *  SCRIPT DE UN SOLO USO — Limpieza de facturas de venta cargadas mal
 * ============================================================================
 *
 *  Borra TODAS las facturas de venta (Invoice type = SALE) + sus notas de
 *  crédito/débito de venta (NCV/NDV ligadas a esas facturas), revirtiendo el
 *  inventario que movieron. NO toca la carga inicial de inventario (esos
 *  movimientos son ADJUSTMENT_IN, no SALE/RETURN).
 *
 *  Reversa de inventario: por CADA StockMovement que se borra se aplica
 *    Stock.quantity -= movement.quantity
 *  Como las ventas tienen quantity negativa y las devoluciones (RETURN_IN)
 *  positiva, esto deja el stock exactamente como antes de la venta, aunque
 *  haya habido devoluciones parciales.
 *
 *  Qué borra por cada FACTURA de venta:
 *    StockMovement(SALE) · InvoiceItem · Payment · PrintJob ·
 *    Receivable(+ReceivablePayment) · SalesBookEntry · CustomerIvaRetention · Invoice
 *  Qué borra por cada NOTA NCV/NDV ligada:
 *    StockMovement(RETURN_IN/RETURN_OUT) · CreditDebitNoteItem ·
 *    SalesBookEntry(de la nota) · CreditDebitNote
 *  Y pone en 0 los correlativos de las series de ventas.
 *
 *  SEGURIDAD:
 *    - Por defecto DRY RUN: solo reporta, NO borra.
 *    - Para borrar de verdad: CONFIRM=DELETE_ALL_SALES
 *    - Aborta si encuentra datos que NO sabe limpiar (recibos o programaciones
 *      de pago ligados a notas, pagos de CxC recibidos), salvo FORCE=1.
 *
 *  USO (en el servidor, dentro de /opt/Trinity):
 *    export DATABASE_URL="$(grep '^DATABASE_URL=' packages/database/.env | cut -d= -f2-)"
 *    # 1) Dry run:
 *    pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts
 *    # 2) Borrado real:
 *    CONFIRM=DELETE_ALL_SALES pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts
 *
 *  >>> BORRAR ESTE ARCHIVO DESPUÉS DE USARLO <<<
 * ============================================================================
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIRM = process.env.CONFIRM === 'DELETE_ALL_SALES';
const FORCE = process.env.FORCE === '1';
const log = (...a: any[]) => console.log(...a);

async function main() {
  log('========================================================');
  log('  LIMPIEZA DE FACTURAS DE VENTA (script de un solo uso)');
  log('  Modo:', CONFIRM ? '*** BORRADO REAL ***' : 'DRY RUN (no borra nada)');
  log('========================================================\n');

  // ---- 1) Conjuntos objetivo ---------------------------------------------
  const invoices = await prisma.invoice.findMany({
    where: { type: 'SALE' },
    select: { id: true, number: true, status: true },
  });
  const invoiceIds = invoices.map((i) => i.id);
  const invoiceNumbers = invoices.map((i) => i.number).filter(Boolean) as string[];

  if (invoiceIds.length === 0) {
    log('No hay facturas de venta (type=SALE). Nada que hacer.');
    return;
  }

  // Notas NCV/NDV ligadas a esas facturas
  const notes = await prisma.creditDebitNote.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true, number: true, type: true, status: true },
  });
  const noteIds = notes.map((n) => n.id);
  const noteNumbers = notes.map((n) => n.number).filter(Boolean) as string[];

  // CxC generadas por esas facturas
  const receivables = await prisma.receivable.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true },
  });
  const receivableIds = receivables.map((r) => r.id);

  // ---- 2) Movimientos de inventario a revertir ---------------------------
  //   a) ventas        -> type SALE, reference = nº de factura
  //   b) devoluciones   -> RETURN_IN/RETURN_OUT, reference = nº de nota
  const saleMovements = await prisma.stockMovement.findMany({
    where: { type: 'SALE', reference: { in: invoiceNumbers } },
    select: { id: true, productId: true, warehouseId: true, quantity: true },
  });
  const noteMovements = noteNumbers.length
    ? await prisma.stockMovement.findMany({
        where: { type: { in: ['RETURN_IN', 'RETURN_OUT'] }, reference: { in: noteNumbers } },
        select: { id: true, productId: true, warehouseId: true, quantity: true },
      })
    : [];
  const allMovements = [...saleMovements, ...noteMovements];

  // ---- 3) Conteos para el reporte ----------------------------------------
  const [itemCount, paymentCount, printJobCount, sbInvoice, retentionCount, noteItemCount, sbNotes] =
    await Promise.all([
      prisma.invoiceItem.count({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.payment.count({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.printJob.count({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.salesBookEntry.count({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.customerIvaRetention.count({ where: { invoiceId: { in: invoiceIds } } }),
      noteIds.length ? prisma.creditDebitNoteItem.count({ where: { noteId: { in: noteIds } } }) : Promise.resolve(0),
      noteNumbers.length ? prisma.salesBookEntry.count({ where: { invoiceNumber: { in: noteNumbers } } }) : Promise.resolve(0),
    ]);

  // ---- 4) Chequeos de seguridad (lo que el script NO sabe limpiar) -------
  const [receivablePayments, receiptItemsOnRet, receiptItemsOnNotes, schedItemsOnNotes] = await Promise.all([
    receivableIds.length ? prisma.receivablePayment.count({ where: { receivableId: { in: receivableIds } } }) : Promise.resolve(0),
    prisma.receiptItem.count({ where: { customerIvaRetention: { invoiceId: { in: invoiceIds } } } }),
    noteIds.length ? prisma.receiptItem.count({ where: { creditDebitNoteId: { in: noteIds } } }) : Promise.resolve(0),
    noteIds.length ? prisma.paymentScheduleItem.count({ where: { creditDebitNoteId: { in: noteIds } } }) : Promise.resolve(0),
  ]);

  const salesSeries = await prisma.serie.findMany({
    where: { type: 'SALES' },
    select: {
      id: true, name: true, prefix: true, isFiscal: true,
      lastInvoiceNumber: true, lastReceivableNumber: true,
      lastCreditNoteNumber: true, lastDebitNoteNumber: true, lastNumber: true,
    },
  });

  // ---- 5) Reporte ---------------------------------------------------------
  log('--- FACTURAS DE VENTA ---');
  log(`  Invoice (type=SALE):   ${invoices.length}  (PAID ${invoices.filter(i => i.status === 'PAID').length}, ` +
      `PENDING ${invoices.filter(i => i.status === 'PENDING').length}, ` +
      `otras ${invoices.filter(i => !['PAID','PENDING'].includes(i.status)).length})`);
  log(`  InvoiceItem:           ${itemCount}`);
  log(`  Payment:               ${paymentCount}`);
  log(`  PrintJob:              ${printJobCount}`);
  log(`  SalesBookEntry (fact): ${sbInvoice}`);
  log(`  CustomerIvaRetention:  ${retentionCount}`);
  log(`  Receivable (CxC):      ${receivables.length}`);
  log('--- NOTAS NCV/NDV LIGADAS ---');
  log(`  CreditDebitNote:       ${notes.length}` + (notes.length ? `  [${notes.map(n => `${n.number}:${n.type}/${n.status}`).join(', ')}]` : ''));
  log(`  CreditDebitNoteItem:   ${noteItemCount}`);
  log(`  SalesBookEntry (nota): ${sbNotes}`);
  log('--- INVENTARIO ---');
  log(`  StockMovement SALE:        ${saleMovements.length}  (se revierten)`);
  log(`  StockMovement RETURN nota: ${noteMovements.length}  (se revierten)`);
  log('--- SERIES DE VENTAS (correlativos -> 0) ---');
  for (const s of salesSeries) {
    log(`  ${s.prefix} (${s.name})${s.isFiscal ? ' [FISCAL]' : ''}: ` +
      `inv=${s.lastInvoiceNumber} cxc=${s.lastReceivableNumber} ncv=${s.lastCreditNoteNumber} ndv=${s.lastDebitNoteNumber}`);
  }
  log('');

  // ---- 6) Bloqueos --------------------------------------------------------
  const blockers: string[] = [];
  if (receivablePayments > 0) blockers.push(`${receivablePayments} pago(s) de CxC ya recibidos`);
  if (receiptItemsOnRet > 0) blockers.push(`${receiptItemsOnRet} recibo(s) ligados a retenciones`);
  if (receiptItemsOnNotes > 0) blockers.push(`${receiptItemsOnNotes} recibo(s) ligados a notas`);
  if (schedItemsOnNotes > 0) blockers.push(`${schedItemsOnNotes} programación(es) de pago ligadas a notas`);
  if (blockers.length) {
    log('⚠️  ADVERTENCIAS (datos que el script no sabe limpiar):');
    blockers.forEach((b) => log('   - ' + b));
    if (!FORCE) { log('\n❌ Abortado por seguridad. Para continuar igual: FORCE=1.'); return; }
    log('   FORCE=1: se continúa.\n');
  }

  if (!CONFIRM) {
    log('🟡 DRY RUN: no se borró nada. Verifica que las facturas (~200) sean lo esperado.');
    log('   Borrado real: CONFIRM=DELETE_ALL_SALES pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts');
    return;
  }

  // ---- 7) BORRADO REAL (una transacción) ---------------------------------
  log('🔴 Ejecutando borrado real...\n');

  // Agregar reversa de stock por (producto, almacén)
  const decByPair = new Map<string, { productId: string; warehouseId: string; qty: number }>();
  for (const m of allMovements) {
    const key = `${m.productId}::${m.warehouseId}`;
    const cur = decByPair.get(key) ?? { productId: m.productId, warehouseId: m.warehouseId, qty: 0 };
    cur.qty += m.quantity;
    decByPair.set(key, cur);
  }

  await prisma.$transaction(async (tx) => {
    // 7.1 Revertir inventario (Stock -= quantity por cada movimiento borrado)
    for (const { productId, warehouseId, qty } of decByPair.values()) {
      await tx.stock.updateMany({ where: { productId, warehouseId }, data: { quantity: { decrement: qty } } });
    }
    log(`  ✔ Stock revertido en ${decByPair.size} par(es) producto/almacén`);

    // 7.2 Borrar movimientos de inventario (ventas + devoluciones de notas)
    const delSaleMov = await tx.stockMovement.deleteMany({ where: { type: 'SALE', reference: { in: invoiceNumbers } } });
    let delNoteMov = 0;
    if (noteNumbers.length) {
      const r = await tx.stockMovement.deleteMany({ where: { type: { in: ['RETURN_IN', 'RETURN_OUT'] }, reference: { in: noteNumbers } } });
      delNoteMov = r.count;
    }
    log(`  ✔ StockMovement borrados: ${delSaleMov.count} venta + ${delNoteMov} devolución`);

    // 7.3 NOTAS: libro, items, recibos/programaciones (si los hay por FORCE), nota
    if (noteIds.length) {
      const delSbNote = await tx.salesBookEntry.deleteMany({ where: { invoiceNumber: { in: noteNumbers }, isManual: false } });
      if (receiptItemsOnNotes > 0) await tx.receiptItem.deleteMany({ where: { creditDebitNoteId: { in: noteIds } } });
      if (schedItemsOnNotes > 0) await tx.paymentScheduleItem.deleteMany({ where: { creditDebitNoteId: { in: noteIds } } });
      const delNoteItems = await tx.creditDebitNoteItem.deleteMany({ where: { noteId: { in: noteIds } } });
      const delNotes = await tx.creditDebitNote.deleteMany({ where: { id: { in: noteIds } } });
      log(`  ✔ Notas: ${delNotes.count} nota(s), ${delNoteItems.count} item(s), ${delSbNote.count} entrada(s) de libro`);
    }

    // 7.4 FACTURAS: retenciones, libro, CxC, pagos, print, items
    const delRet = await tx.customerIvaRetention.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const delSbInv = await tx.salesBookEntry.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    if (receivableIds.length) await tx.receivablePayment.deleteMany({ where: { receivableId: { in: receivableIds } } });
    const delRecv = await tx.receivable.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const delPay = await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const delPj = await tx.printJob.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const delItems = await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    const delInv = await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    log(`  ✔ Facturas: ${delInv.count} factura(s), ${delItems.count} item(s), ${delPay.count} pago(s), ` +
        `${delRecv.count} CxC, ${delSbInv.count} libro, ${delRet.count} retención, ${delPj.count} printJob`);

    // 7.5 Resetear correlativos de series de ventas a 0
    const resetSeries = await tx.serie.updateMany({
      where: { type: 'SALES' },
      data: { lastInvoiceNumber: 0, lastReceivableNumber: 0, lastCreditNoteNumber: 0, lastDebitNoteNumber: 0, lastNumber: 0 },
    });
    log(`  ✔ Series de ventas con correlativos en 0: ${resetSeries.count}`);
  }, { timeout: 120_000 });

  log('\n✅ Listo. Facturas y notas de venta eliminadas, inventario revertido y correlativos reiniciados.');
  log('   Recuerda BORRAR este archivo (cleanup-sales-session.ts) después de usarlo.');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
