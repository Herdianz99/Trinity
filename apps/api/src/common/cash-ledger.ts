import { Prisma } from '@prisma/client';

// Entrada del libro mayor de caja (tabla madre del arqueo). Cada linea de pago/movimiento
// que toca caja escribe una fila con esto. El arqueo suma estas filas por sesion.
export interface CashLedgerInput {
  cashSessionId: string;
  direction: 'IN' | 'OUT'; // IN = entra a caja, OUT = sale
  amountUsd: number;
  amountBs: number;
  currency: 'USD' | 'BS'; // moneda fisica del movimiento
  exchangeRate?: number;
  methodId?: string | null;
  isCash: boolean; // afecta la gaveta fisica (efectivo si; electronico no)
  sourceType: string; // SALE_PAYMENT | CHANGE | RECEIPT_COLLECTION | RECEIPT_PAYMENT |
  //                     EXPENSE | CUSTOMER_ADVANCE | SUPPLIER_ADVANCE | MANUAL | REINTEGRO
  sourceId?: string | null;
  reason?: string | null;
  createdById?: string | null;
  // Fecha real del movimiento. En vivo se omite (default now() = ahora, correcto). En el
  // backfill SIEMPRE pasar la fecha del documento origen (paidAt/createdAt/postedAt) para
  // que el filtro por fecha y el "hoy" del ledger sean reales, no la hora de reconstruccion.
  occurredAt?: Date | null;
}

// Escribe una fila del ledger dentro de la transaccion del documento. Nunca debe dejar la
// caja a medias: SIEMPRE llamarla dentro del $transaction del service que la origina.
export async function writeCashLedger(tx: Prisma.TransactionClient, e: CashLedgerInput) {
  await tx.cashLedgerEntry.create({
    data: {
      cashSessionId: e.cashSessionId,
      direction: e.direction as any,
      amountUsd: Math.round((e.amountUsd || 0) * 100) / 100,
      amountBs: Math.round((e.amountBs || 0) * 100) / 100,
      currency: e.currency,
      exchangeRate: e.exchangeRate ?? 0,
      methodId: e.methodId ?? null,
      isCash: e.isCash,
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? null,
      reason: e.reason ?? null,
      createdById: e.createdById ?? null,
      ...(e.occurredAt ? { createdAt: e.occurredAt } : {}),
    },
  });
}
