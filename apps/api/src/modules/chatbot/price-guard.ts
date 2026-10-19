// Control de precios de la respuesta del bot, antes de que llegue al cliente (funcion PURA, ver _price-guard.test.ts).
// Piloto 2026-10-18: el bot escribio "12.43$ bcv... perdon, en 206.56$" (12.43 era el numero del ejemplo del prompt).
// Con el bot automatico nadie revisa antes de enviar, asi que todo monto en $ debe salir de una herramienta:
// tal cual, por una cantidad entera que el cliente o el bot mencionaron (10 cabillas a 14.44 = 144.40), o como suma
// de montos ya validados de la misma respuesta (total general).

const MONEY_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*\$/g;
const MAX_SUM_TERMS = 12; // subconjuntos de hasta 2^12 combinaciones

const cents = (v: number) => Math.round(v * 100);

// "1,234.50" -> 1234.5; "12,43" -> 12.43; "206.56" -> 206.56
export function parseMoney(s: string): number {
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(',', '.'));
}

// Montos en $ que aparecen en el texto del bot.
export function moneyInText(text: string): number[] {
  return [...(text || '').matchAll(MONEY_RE)].map((m) => parseMoney(m[1]));
}

// Todos los numeros de un texto/JSON (precios de herramientas, cantidades del cliente...).
export function numbersIn(s: string): number[] {
  return (String(s ?? '').match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.')));
}

// Devuelve los montos de la respuesta que no se pueden justificar. [] = la respuesta pasa.
// known: numeros que salieron de herramientas (y textos de configuracion); quantities: cantidades enteras
// mencionadas en la conversacion (cliente o input de las herramientas).
export function unverifiedPrices(text: string, known: Iterable<number>, quantities: Iterable<number>): number[] {
  const knownC = new Set([...known].map(cents));
  const qty = [...new Set([...quantities].filter((q) => Number.isInteger(q) && q >= 2 && q <= 100000))];
  const amounts = moneyInText(text);
  const valid: number[] = [];
  const pending: number[] = [];
  for (const a of amounts) {
    const c = cents(a);
    const ok = knownC.has(c) || qty.some((q) => c % q === 0 && knownC.has(c / q));
    (ok ? valid : pending).push(c);
  }
  if (!pending.length) return [];
  // Total general: suma de montos ya validados en la misma respuesta.
  const terms = [...new Set(valid)].slice(0, MAX_SUM_TERMS);
  const sums = new Set<number>();
  for (let mask = 1; mask < 1 << terms.length; mask++) {
    let s = 0;
    for (let i = 0; i < terms.length; i++) if (mask & (1 << i)) s += terms[i];
    sums.add(s);
  }
  return pending.filter((c) => !sums.has(c)).map((c) => c / 100);
}
