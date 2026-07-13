/**
 * Correlativo de retenciones de IVA.
 *
 * `IvaRetention` y `RetentionVoucher` son tablas distintas (cada una con su UNIQUE
 * sobre `number`) pero COMPARTEN el contador `CompanyConfig.retentionNextNumber`.
 * El numero emitido es `YYYYMM` + secuencia de 8 digitos.
 *
 * Bug historico: si el contador quedaba por DETRAS de un numero ya emitido (p.ej.
 * tras un rollback de transaccion o un restore de BD), el sistema regeneraba un
 * `number` que ya existia y `create()` fallaba con "Unique constraint failed on
 * (number)", trabando el procesar facturas y las CxP con retencion.
 *
 * La solucion es hacer el correlativo AUTO-SANABLE: en vez de confiar ciegamente en
 * el contador, tomar el mayor entre el contador y el maximo ya usado en AMBAS tablas.
 */

/**
 * Siguiente secuencia de retencion, auto-sanable. Debe llamarse DENTRO de la
 * transaccion (`tx`) que va a crear el documento y luego incrementar el contador a
 * `seq + 1`.
 */
export async function nextRetentionSeq(tx: any): Promise<number> {
  const cfg = await tx.companyConfig.findUnique({
    where: { id: 'singleton' },
    select: { retentionNextNumber: true },
  });
  const rows = await tx.$queryRaw<{ maxseq: number }[]>`
    SELECT GREATEST(
      COALESCE((SELECT MAX(CAST(RIGHT("number", 8) AS integer)) FROM "IvaRetention" WHERE "number" ~ '^[0-9]+$'), 0),
      COALESCE((SELECT MAX(CAST(RIGHT("number", 8) AS integer)) FROM "RetentionVoucher" WHERE "number" ~ '^[0-9]+$'), 0)
    )::int AS maxseq
  `;
  const maxUsed = Number(rows?.[0]?.maxseq ?? 0);
  return Math.max(cfg?.retentionNextNumber ?? 1, maxUsed + 1);
}

/** Formatea el numero de retencion: `YYYYMM` + secuencia de 8 digitos. */
export function formatRetentionNumber(seq: number, when: Date = new Date()): string {
  const prefix = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}`;
  return `${prefix}${String(seq).padStart(8, '0')}`;
}
