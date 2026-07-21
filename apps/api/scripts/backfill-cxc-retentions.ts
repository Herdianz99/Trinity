// Backfill: crea el documento CustomerIvaRetention (RVC-XXXX) para las retenciones de CxC
// que se registraron con el camino viejo — solo dejaron una linea en el libro de ventas
// (SalesBookEntry.isRetentionLine con receivableId) sin documento asociado.
//
// Idempotente: salta las lineas que ya tienen un CustomerIvaRetention (por salesBookEntryId
// o por receivableId). Dry-run por defecto; usar --execute para aplicar.
//
// Correr en el servidor (cwd = apps/api, usa DATABASE_URL del .env):
//   npx tsx scripts/backfill-cxc-retentions.ts            # dry-run
//   npx tsx scripts/backfill-cxc-retentions.ts --execute  # aplica
import { PrismaClient } from '@prisma/client';
(process as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextNumber(): Promise<string> {
  const last = await prisma.customerIvaRetention.findFirst({
    where: { number: { startsWith: 'RVC-' } },
    orderBy: { createdAt: 'desc' },
    select: { number: true },
  });
  let next = 1;
  if (last) {
    const n = parseInt(last.number.split('-')[1], 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `RVC-${String(next).padStart(4, '0')}`;
}

async function main() {
  console.log(`Modo: ${EXECUTE ? 'EJECUTAR' : 'DRY-RUN'}`);
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
  if (!admin) throw new Error('No hay ADMIN activo para createdById');

  // Lineas de retencion de CxC en el libro
  const lines = await prisma.salesBookEntry.findMany({
    where: { isRetentionLine: true, receivableId: { not: null } },
    orderBy: { entryDate: 'asc' },
  });
  console.log(`Lineas de retencion de CxC en el libro: ${lines.length}`);

  let created = 0;
  let skipped = 0;

  for (const line of lines) {
    const receivableId = line.receivableId!;
    // Ya tiene documento? (por la linea o por la CxC)
    const existing = await prisma.customerIvaRetention.findFirst({
      where: { OR: [{ salesBookEntryId: line.id }, { receivableId }], cancelledAt: null },
      select: { id: true, number: true },
    });
    if (existing) { skipped++; continue; }

    const rec = await prisma.receivable.findUnique({
      where: { id: receivableId },
      include: { customer: { select: { id: true, name: true, rif: true } } },
    });
    if (!rec || !rec.customerId) {
      console.warn(`  ! CxC ${receivableId} sin cliente — se omite (line ${line.id})`);
      skipped++;
      continue;
    }

    const retentionBs = line.retentionAmountBs || 0;
    const ivaBs = rec.totalIvaBs || 0;
    const rate = rec.exchangeRate || 0;
    const retPct = ivaBs > 0 ? round2((retentionBs / ivaBs) * 100) : 75;
    const retentionUsd = rate > 0 ? round2(retentionBs / rate) : 0;
    const number = await nextNumber();

    console.log(`  + ${number}  CxC ${rec.number}  ${rec.customer?.name}  Bs ${retentionBs.toFixed(2)}  (${retPct}%)  comp:${line.retentionVoucherNumber || '--'}`);

    if (EXECUTE) {
      await prisma.customerIvaRetention.create({
        data: {
          number,
          invoiceId: null,
          receivableId,
          customerId: rec.customerId,
          taxableBaseUsd: (rec.taxableBase8Usd || 0) + (rec.taxableBase16Usd || 0) + (rec.taxableBase31Usd || 0),
          taxableBaseBs: (rec.taxableBase8Bs || 0) + (rec.taxableBase16Bs || 0) + (rec.taxableBase31Bs || 0),
          ivaAmountUsd: rec.totalIvaUsd || 0,
          ivaAmountBs: ivaBs,
          retentionPct: retPct,
          retentionUsd,
          retentionBs,
          exchangeRate: rate,
          voucherNumber: line.retentionVoucherNumber || null,
          voucherDate: line.retentionVoucherNumber ? line.entryDate : null,
          voucherReceivedAt: line.retentionVoucherNumber ? line.entryDate : null,
          salesBookEntryId: line.id,
          createdById: admin.id,
        },
      });
    }
    created++;
  }

  console.log(`\n${EXECUTE ? 'Creados' : 'Se crearian'}: ${created} | Ya existentes/omitidos: ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
