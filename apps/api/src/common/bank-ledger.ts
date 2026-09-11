import { Prisma } from '@prisma/client';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

// Entrada del libro banco. Cada pago electronico o movimiento manual escribe una fila con esto.
export interface BankMovementInput {
  bankAccountId: string;
  date: Date;
  direction: 'IN' | 'OUT';
  amount: number; // moneda de la cuenta
  amountBs: number;
  amountUsd: number;
  exchangeRate?: number;
  type: string; // COBRO|PAGO|COMISION|IGTF|...
  reference?: string | null;
  description?: string | null;
  sourceType: string; // SALE_PAYMENT|RECEIPT_COLLECTION|RECEIPT_PAYMENT|EXPENSE|ADVANCE|MANUAL
  sourceId?: string | null;
  transferGroupId?: string | null;
  createdById: string;
}

/**
 * Escribe un movimiento en el libro banco de forma IDEMPOTENTE: si ya existe uno con la
 * misma (sourceType, sourceId, bankAccountId, amount) NO crea otro (protege contra dobles
 * clics/reintentos). Los MANUAL nunca se deduplican (sourceId null).
 */
export async function writeBankMovement(tx: Prisma.TransactionClient, e: BankMovementInput) {
  if (e.sourceType !== 'MANUAL' && e.sourceId) {
    const existing = await tx.bankMovement.findFirst({
      where: {
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        bankAccountId: e.bankAccountId,
        amount: r2(e.amount),
      },
    });
    if (existing) return existing;
  }
  return tx.bankMovement.create({
    data: {
      bankAccountId: e.bankAccountId,
      date: e.date,
      direction: e.direction,
      amount: r2(e.amount),
      amountBs: r2(e.amountBs),
      amountUsd: r2(e.amountUsd),
      exchangeRate: e.exchangeRate ?? 0,
      type: e.type,
      reference: e.reference ?? null,
      description: e.description ?? null,
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? null,
      transferGroupId: e.transferGroupId ?? null,
      createdById: e.createdById,
    },
  });
}

/**
 * Engancha un pago electronico al libro banco. No hace nada si:
 *  - el modulo bancos esta apagado (bancosEnabled=false),
 *  - el metodo no tiene cuenta bancaria (efectivo o metodo sin configurar).
 * El monto que impacta la cuenta se toma en la moneda de la cuenta (USD o Bs).
 */
export async function recordPaymentToBank(
  tx: Prisma.TransactionClient,
  opts: {
    bancosEnabled: boolean;
    method: { bankAccountId: string | null };
    direction: 'IN' | 'OUT';
    amountUsd: number;
    amountBs: number;
    exchangeRate: number;
    date: Date;
    type: string; // COBRO | PAGO
    sourceType: string;
    sourceId: string;
    reference?: string | null;
    description?: string | null;
    createdById: string;
  },
) {
  if (!opts.bancosEnabled) return;
  if (!opts.method.bankAccountId) return;
  const account = await tx.bankAccount.findUnique({ where: { id: opts.method.bankAccountId } });
  if (!account || !account.isActive) return;
  const amount = account.currency === 'USD' ? opts.amountUsd : opts.amountBs;
  await writeBankMovement(tx, {
    bankAccountId: account.id,
    date: opts.date,
    direction: opts.direction,
    amount,
    amountBs: opts.amountBs,
    amountUsd: opts.amountUsd,
    exchangeRate: opts.exchangeRate,
    type: opts.type,
    reference: opts.reference ?? null,
    description: opts.description ?? null,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId,
    createdById: opts.createdById,
  });
}
