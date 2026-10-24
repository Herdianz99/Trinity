// Listas de materiales demasiado largas para el bot (funcion PURA, ver _list-guard.test.ts).
// Piloto 2026-10-21: una lista de 56 renglones hizo que el bot pidiera una busqueda por renglon en la misma
// vuelta (47 llamadas = 4096 tokens de salida) y se cortara con stop_max_tokens antes de responder. Listas de
// hasta ~27 renglones se cotizaron bien en el piloto (el bot las reparte en varias vueltas), asi que el tope
// deja margen: por encima, el presupuesto lo prepara un asesor.
export const MAX_LIST_LINES = 30;

// Renglones con texto del mensaje (saludo, nombre y ciudad cuentan: el tope ya tiene margen para eso).
export function listLines(text: string): number {
  return String(text ?? '').split(/\r?\n/).filter((l) => /[\p{L}\p{N}]/u.test(l)).length;
}

export function isLongList(text: string): boolean {
  return listLines(text) > MAX_LIST_LINES;
}
