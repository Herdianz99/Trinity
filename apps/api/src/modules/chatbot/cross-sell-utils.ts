// Funciones PURAS de la venta cruzada del chatbot (sin Nest ni Prisma): se testean en _cross-sell.test.ts.

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'para', 'p', 'con', 'sin', 'x', 'y', 'en', 'a', 'al', 'por', 'tipo', 'und', 'unid',
]);

// Minusculas, sin acentos, espacios simples. Asi se guardan y comparan triggers y ofertas.
export function normalizeTerm(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Clave unica de una regla: trigger + ofertas ordenadas y sin repetir.
export function ruleKey(trigger: string, offerTerms: string[]): string {
  const offers = [...new Set(offerTerms.map(normalizeTerm).filter(Boolean))].sort();
  return [normalizeTerm(trigger), ...offers].join('|');
}

// Medidas del nombre: "4-1/2" / "4 1/2" -> "4-1/2"; "3/8" -> "3/8"; "10MM" -> "10mm". "½" se trata como 1/2.
export function extractMeasures(name: string): Set<string> {
  const s = normalizeTerm(name).replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4');
  const out = new Set<string>();
  const re = /(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:[.,]\d+)?)\s*(mm|cm)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[1]) out.add(`${m[1]}-${m[2]}/${m[3]}`);
    else if (m[4]) out.add(`${m[4]}/${m[5]}`);
    else out.add(`${m[6].replace(',', '.')}${m[7]}`);
  }
  return out;
}

export function sharesMeasure(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

// Palabras "con significado" de un nombre: >= 3 letras, sin digitos ni palabras vacias.
function significantWords(name: string): string[] {
  return normalizeTerm(name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/\d/.test(w) && !STOPWORDS.has(w));
}

// Tipo de producto para agrupar en el analisis: primera palabra significativa ("ESMERIL ANGULAR..." -> "esmeril").
export function firstSignificantWord(name: string): string | null {
  return significantWords(name)[0] ?? null;
}

// Heuristica: el bot "ofrecio" el producto si su respuesta menciona >= 60% de las palabras significativas
// del nombre (el bot suele acortar nombres y quitar codigos).
export function wasOffered(productName: string, text: string): boolean {
  const words = significantWords(productName);
  if (!words.length) return false;
  const t = normalizeTerm(text);
  const hits = words.filter((w) => t.includes(w)).length;
  return hits / words.length >= 0.6;
}

export interface PairCounts {
  total: number;                 // facturas
  single: Map<string, number>;   // grupo -> nº de facturas con ese grupo
  pair: Map<string, number>;     // "a|b" (a < b) -> nº de facturas con ambos
}

// Cada factura = conjunto de grupos (primera palabra de sus productos).
export function countPairs(invoices: Set<string>[]): PairCounts {
  const single = new Map<string, number>();
  const pair = new Map<string, number>();
  for (const set of invoices) {
    const g = [...set].sort();
    for (let i = 0; i < g.length; i++) {
      single.set(g[i], (single.get(g[i]) || 0) + 1);
      for (let j = i + 1; j < g.length; j++) {
        const k = `${g[i]}|${g[j]}`;
        pair.set(k, (pair.get(k) || 0) + 1);
      }
    }
  }
  return { total: invoices.length, single, pair };
}

export interface CrossSellSuggestion { trigger: string; offer: string; base: number; pct: number; lift: number }

// A -> B se sugiere si: facturas con A >= minBase, % de esas que llevan B >= minPct y
// lift = %(B|A) / %(B) >= minLift (evita lo que va en casi todas las facturas, como el cemento).
export function selectSuggestions(
  c: PairCounts,
  opts: { minBase: number; minPct: number; minLift: number; maxPerTrigger: number },
): CrossSellSuggestion[] {
  const byTrigger = new Map<string, CrossSellSuggestion[]>();
  const consider = (a: string, b: string, both: number) => {
    const base = c.single.get(a) || 0;
    const bCount = c.single.get(b) || 0;
    if (base < opts.minBase || !bCount || !c.total) return;
    const pct = (both / base) * 100;
    const lift = (both / base) / (bCount / c.total);
    if (pct < opts.minPct || lift < opts.minLift) return;
    const list = byTrigger.get(a) ?? [];
    list.push({ trigger: a, offer: b, base, pct: Math.round(pct * 10) / 10, lift: Math.round(lift * 10) / 10 });
    byTrigger.set(a, list);
  };
  for (const [k, both] of c.pair) {
    const [a, b] = k.split('|');
    consider(a, b, both);
    consider(b, a, both);
  }
  const out: CrossSellSuggestion[] = [];
  for (const list of byTrigger.values()) {
    out.push(...list.sort((x, y) => y.lift - x.lift).slice(0, opts.maxPerTrigger));
  }
  return out;
}

// Variantes defectuosas que existen como producto aparte (saco roto, segunda): van al final.
// OJO: (B) y (D) NO son variantes: en la grande el cemento que se vende es "SELLADO (B)" / "(D)".
export const VARIANT_RE = /\((ROTO|ROTA|SEGUNDA|SEG|DEFECTO|MUESTRA)\)|\bSEGUNDA\b/i;
