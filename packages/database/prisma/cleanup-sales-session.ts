/**
 * ============================================================================
 *  SCRIPT DE UN SOLO USO — Limpieza de facturas de venta cargadas mal
 * ============================================================================
 *
 *  Borra TODAS las facturas de venta (Invoice type = SALE) y SOLO sus datos
 *  derivados, revirtiendo el inventario que descontaron. NO toca la carga
 *  inicial de inventario (esos movimientos son ADJUSTMENT_IN, no SALE).
 *
 *  Qué borra / revierte por cada factura de venta:
 *    - StockMovement tipo SALE  -> revierte el stock (suma de vuelta) y los borra
 *    - InvoiceItem
 *    - Payment
 *    - PrintJob
 *    - Receivable (CxC generadas por la factura) + ReceivablePayment
 *    - SalesBookEntry (libro de ventas SENIAT)
 *    - CustomerIvaRetention (retenciones de IVA del cliente)
 *    - Invoice
 *  Y al final pone en 0 los correlativos de las series de ventas
 *  (lastInvoiceNumber, lastReceivableNumber, etc.) para que la próxima
 *  factura arranque desde 1.
 *
 *  SEGURIDAD:
 *    - Por defecto corre en DRY RUN: solo muestra lo que haría, NO borra.
 *    - Para borrar de verdad: CONFIRM=DELETE_ALL_SALES
 *    - Aborta si encuentra datos que no debería destruir a ciegas
 *      (notas de crédito/débito, recibos, pagos de CxC ya recibidos),
 *      salvo que se fuerce con FORCE=1.
 *
 *  USO (en el servidor, dentro de /opt/Trinity):
 *    # 1) Ver qué pasaría (no borra nada):
 *    pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts
 *
 *    # 2) Ejecutar el borrado real:
 *    CONFIRM=DELETE_ALL_SALES pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts
 *
 *  >>> BORRAR ESTE ARCHIVO DESPUÉS DE USARLO <<<
 * ============================================================================
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONFIRM = process.env.CONFIRM === 'DELETE_ALL_SALES';
const FORCE = process.env.FORCE === '1';

function log(...args: any[]) {
  console.log(...args);
}

async function main() {
  log('========================================================');
  log('  LIMPIEZA DE FACTURAS DE VENTA (script de un solo uso)');
  log('  Modo:', CONFIRM ? '*** BORRADO REAL ***' : 'DRY RUN (no borra nada)');
  log('========================================================\n');

  // ---- 1) Identificar el conjunto objetivo: facturas de venta -------------
  const invoices = await prisma.invoice.findMany({
    where: { type: 'SALE' },
    select: { id: true, number: true, status: true },
  });
  const invoiceIds = invoices.map((i) => i.id);

  if (invoiceIds.length === 0) {
    log('No hay facturas de venta (type=SALE). Nada que hacer.');
    return;
  }

  // Receivables generadas por estas facturas
  const receivables = await prisma.receivable.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true },
  });
  const receivableIds = receivables.map((r) => r.id);

  // ---- 2) Conteos para el reporte ----------------------------------------
  const [
    itemCount,
    paymentCount,
    printJobCount,
    salesBookByInvoice,
    salesBookByReceivable,
    retentionCount,
    saleMovements,
  ] = await Promise.all([
    prisma.invoiceItem.count({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.payment.count({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.printJob.count({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.salesBookEntry.count({ where: { invoiceId: { in: invoiceIds } } }),
    receivableIds.length
      ? prisma.salesBookEntry.count({ where: { receivableId: { in: receivableIds } } })
      : Promise.resolve(0),
    prisma.customerIvaRetention.count({ where: { invoiceId: { in: invoiceIds } } }),
    prisma.stockMovement.findMany({
      where: { type: 'SALE', reference: { in: invoices.map((i) => i.number).filter(Boolean) as string[] } },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    }),
  ]);

  // ---- 3) Chequeos de seguridad (datos que NO deberíamos destruir a ciegas)
  const [creditDebitNotes, receivablePayments, receiptItemsOnRetentions] = await Promise.all([
    prisma.creditDebitNote.count({ where: { invoiceId: { in: invoiceIds } } }),
    receivableIds.length
      ? prisma.receivablePayment.count({ where: { receivableId: { in: receivableIds } } })
      : Promise.resolve(0),
    prisma.receiptItem.count({
      where: { customerIvaRetention: { invoiceId: { in: invoiceIds } } },
    }),
  ]);

  // Series de ventas con sus correlativos actuales
  const salesSeries = await prisma.serie.findMany({
    where: { type: 'SALES' },
    select: {
      id: true, name: true, prefix: true, isFiscal: true,
      lastInvoiceNumber: true, lastReceivableNumber: true,
      lastCreditNoteNumber: true, lastDebitNoteNumber: true, lastNumber: true,
    },
  });

  // ---- 4) Reporte ---------------------------------------------------------
  log('--- LO QUE SE BORRARÍA / REVERTIRÍA ---');
  log(`  Facturas de venta (Invoice type=SALE): ${invoices.length}`);
  log(`    - PAID:    ${invoices.filter((i) => i.status === 'PAID').length}`);
  log(`    - PENDING: ${invoices.filter((i) => i.status === 'PENDING').length}`);
  log(`    - otras:   ${invoices.filter((i) => !['PAID', 'PENDING'].includes(i.status)).length}`);
  log(`  InvoiceItem:                 ${itemCount}`);
  log(`  Payment:                     ${paymentCount}`);
  log(`  PrintJob:                    ${printJobCount}`);
  log(`  StockMovement (SALE):        ${saleMovements.length}  (se revierte el stock)`);
  log(`  SalesBookEntry (x factura):  ${salesBookByInvoice}`);
  log(`  SalesBookEntry (x CxC):      ${salesBookByReceivable}`);
  log(`  CustomerIvaRetention:        ${retentionCount}`);
  log(`  Receivable (CxC):            ${receivables.length}`);
  log('');
  log('--- SERIES DE VENTAS (correlativos -> se pondrán en 0) ---');
  for (const s of salesSeries) {
    log(`  ${s.prefix} (${s.name})${s.isFiscal ? ' [FISCAL]' : ''}: ` +
      `inv=${s.lastInvoiceNumber} cxc=${s.lastReceivableNumber} ` +
      `ncv=${s.lastCreditNoteNumber} ndv=${s.lastDebitNoteNumber}`);
  }
  log('');

  // ---- 5) Bloqueos de seguridad ------------------------------------------
  const blockers: string[] = [];
  if (creditDebitNotes > 0) blockers.push(`Hay ${creditDebitNotes} nota(s) de crédito/débito ligadas a estas facturas`);
  if (receivablePayments > 0) blockers.push(`Hay ${receivablePayments} pago(s) de CxC ya recibidos`);
  if (receiptItemsOnRetentions > 0) blockers.push(`Hay ${receiptItemsOnRetentions} recibo(s) ligados a retenciones`);

  if (blockers.length > 0) {
    log('⚠️  ADVERTENCIAS (datos derivados que normalmente NO deberían existir si solo cargaste ventas):');
    blockers.forEach((b) => log('   - ' + b));
    if (!FORCE) {
      log('\n❌ Abortado por seguridad. Si estás seguro de borrarlos igual, corre con FORCE=1.');
      return;
    }
    log('   FORCE=1 activo: se continúa de todas formas.\n');
  }

  if (!CONFIRM) {
    log('🟡 DRY RUN: no se borró nada.');
    log('   Verifica que el conteo de facturas (~200) sea el esperado.');
    log('   Para ejecutar el borrado real:');
    log('   CONFIRM=DELETE_ALL_SALES pnpm --filter @trinity/database exec tsx prisma/cleanup-sales-session.ts');
    return;
  }

  // ---- 6) BORRADO REAL (todo en una transacción) -------------------------
  log('🔴 Ejecutando borrado real...\n');

  // Agregar reversa de stock por (producto, almacén)
  const decByPair = new Map<string, { productId: string; warehouseId: string; qty: number }>();
  for (const m of saleMovements) {
    const key = `${m.productId}::${m.warehouseId}`;
    const cur = decByPair.get(key) ?? { productId: m.productId, warehouseId: m.warehouseId, qty: 0 };
    cur.qty += m.quantity; // quantity es negativa en ventas
    decByPair.set(key, cur);
  }

  await prisma.$transaction(async (tx) => {
    // 6.1 Revertir inventario: quantity de venta es negativa -> restarla suma de vuelta
    for (const { productId, warehouseId, qty } of decByPair.values()) {
      await tx.stock.updateMany({
        where: { productId, warehouseId },
        data: { quantity: { decrement: qty } }, // decrement de un negativo = incremento
      });
    }
    log(`  ✔ Stock revertido en ${decByPair.size} combinación(es) producto/almacén`);

    // 6.2 Borrar movimientos de venta
    const delMov = await tx.stockMovement.deleteMany({
      where: { type: 'SALE', reference: { in: invoices.map((i) => i.number).filter(Boolean) as string[] } },
    });
    log(`  ✔ StockMovement (SALE) borrados: ${delMov.count}`);

    // 6.3 Retenciones de IVA del cliente (referencian salesBookEntry -> primero estas)
    const delRet = await tx.customerIvaRetention.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    log(`  ✔ CustomerIvaRetention borradas: ${delRet.count}`);

    // 6.4 Libro de ventas (por factura y por CxC)
    const delSbInv = await tx.salesBookEntry.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    let sbRecv = 0;
    if (receivableIds.length) {
      const r = await tx.salesBookEntry.deleteMany({ where: { receivableId: { in: receivableIds } } });
      sbRecv = r.count;
    }
    log(`  ✔ SalesBookEntry borrados: ${delSbInv.count + sbRecv}`);

    // 6.5 Pagos de CxC (si los hubiera) y CxC
    if (receivableIds.length) {
      const delRp = await tx.receivablePayment.deleteMany({ where: { receivableId: { in: receivableIds } } });
      if (delRp.count) log(`  ✔ ReceivablePayment borrados: ${delRp.count}`);
    }
    const delRecv = await tx.receivable.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    log(`  ✔ Receivable borradas: ${delRecv.count}`);

    // 6.6 Pagos, print jobs, items
    const delPay = await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    log(`  ✔ Payment borrados: ${delPay.count}`);
    const delPj = await tx.printJob.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    log(`  ✔ PrintJob borrados: ${delPj.count}`);
    const delItems = await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    log(`  ✔ InvoiceItem borrados: ${delItems.count}`);

    // 6.7 Facturas
    const delInv = await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    log(`  ✔ Invoice borradas: ${delInv.count}`);

    // 6.8 Resetear correlativos de series de ventas a 0
    const resetSeries = await tx.serie.updateMany({
      where: { type: 'SALES' },
      data: {
        lastInvoiceNumber: 0,
        lastReceivableNumber: 0,
        lastCreditNoteNumber: 0,
        lastDebitNoteNumber: 0,
        lastNumber: 0,
      },
    });
    log(`  ✔ Series de ventas con correlativos en 0: ${resetSeries.count}`);
  }, { timeout: 120_000 });

  log('\n✅ Listo. Facturas de venta eliminadas y correlativos reiniciados.');
  log('   Recuerda BORRAR este archivo (cleanup-sales-session.ts) después de usarlo.');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
