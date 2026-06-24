/**
 * Utilidades de zona horaria — Venezuela / America/Caracas (UTC-4 fijo, sin horario
 * de verano desde 2016).
 *
 * El servidor corre en UTC. Si "hoy" se calcula como el dia-calendario UTC, todo lo
 * ocurrido despues de las 8 PM en Caracas (= medianoche UTC) cae en el dia siguiente:
 * las ventas de la noche se mezclan con las del dia posterior y los lookups de "tasa
 * de hoy" fallan. Estas utilidades anclan los calculos al dia-calendario de Caracas.
 *
 * Hay DOS conceptos distintos, no confundirlos:
 *
 *  1) Campos TIMESTAMP (instantes reales: createdAt, paidAt, openedAt, postedAt...).
 *     El rango de un dia debe ser [00:00, 23:59:59.999] hora de Caracas, expresado
 *     como instantes UTC.  -> caracasDayStart / caracasDayEnd
 *
 *  2) Campos DATE-ONLY guardados a medianoche UTC (exchangeRate.date, y comparaciones
 *     "hoy" contra ese tipo de campo). La clave es la medianoche UTC del dia-calendario
 *     de Caracas.  -> caracasDateKey
 *
 *     NOTA: las tasas se guardan a medianoche-UTC de la fecha-Caracas (se registran de
 *     dia en Caracas), por eso los lookups de tasa usan caracasDateKey, NO caracasDayStart.
 */

export const CARACAS_TZ = 'America/Caracas';
const CARACAS_OFFSET = '-04:00';

// 'YYYY-MM-DD' del dia indicado (por defecto, ahora) en hora de Caracas.
export function caracasToday(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Normaliza una entrada a su 'YYYY-MM-DD' de Caracas. Si ya es una fecha pura
// ('YYYY-MM-DD'), se respeta tal cual (es una fecha-calendario, no un instante).
export function toCaracasYmd(input: string | Date): string {
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    return caracasToday(new Date(input));
  }
  return caracasToday(input);
}

// --- Para campos TIMESTAMP: limites del dia-calendario de Caracas como instantes UTC.
export function caracasDayStart(input: string | Date = new Date()): Date {
  return new Date(`${toCaracasYmd(input)}T00:00:00.000${CARACAS_OFFSET}`);
}
export function caracasDayEnd(input: string | Date = new Date()): Date {
  return new Date(`${toCaracasYmd(input)}T23:59:59.999${CARACAS_OFFSET}`);
}

// --- Para campos DATE-ONLY guardados a medianoche UTC (p. ej. exchangeRate.date) y
//     para comparaciones "hoy" contra ellos: medianoche UTC del dia-calendario Caracas.
export function caracasDateKey(input: string | Date = new Date()): Date {
  return new Date(`${toCaracasYmd(input)}T00:00:00.000Z`);
}

// Fecha ('YYYY-MM-DD') y hora (0-23) de un instante, en hora de Caracas.
// Util para agrupar (timeline por hora/dia).
export function caracasParts(d: Date): { ymd: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hour: parseInt(get('hour'), 10) };
}
