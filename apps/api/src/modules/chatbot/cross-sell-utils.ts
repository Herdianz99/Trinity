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
