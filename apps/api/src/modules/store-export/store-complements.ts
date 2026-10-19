// Logica PURA de "Tambien te puede servir" en la tienda: a partir de las reglas ACTIVAS de venta cruzada del
// chatbot, elige productos concretos para mostrar en la ficha de cada producto. Se testea en _store-complements.test.ts.
// El bot ofrece el TIPO ("discos de corte para 4-1/2""); la tienda muestra productos, asi que aqui se escoge cuales.
// Las palabras de la regla no bastan para elegir: el buscador en espanol junta "pego" y "pega" (pega PVC para una
// ceramica) y "disco de corte" trae el disco de desmalezadora. Por eso solo se muestra lo que de verdad se vendio
// junto con productos de la regla (pairCount) y se ordena por eso.
import { extractMeasures, sharesMeasure, VARIANT_RE } from '../chatbot/cross-sell-utils';

export const MAX_COMPLEMENTS = 4;
export const MIN_PAIR_INVOICES = 2; // facturas en que el complemento salio junto a un producto que dispara la regla
const PER_TERM = 2;

// Medidas para comparar: las de extractMeasures (fracciones, mm, cm) + pulgadas enteras con marca (7", 9"), que
// extractMeasures no toma y sin ellas a un esmeril de 9" se le ofrecian discos de 4-1/2". El 2" de 4-1/2" no cuenta.
export function storeMeasures(name: string): Set<string> {
  const out = extractMeasures(name);
  for (const m of name.matchAll(/(?<![\d/.,-])(\d+)\s*(?:"|”|'')/g)) out.add(`${m[1]}"`);
  return out;
}

export interface ComplementProduct {
  code: string;
  name: string;
  available: boolean; // con existencia libre (no agotado)
  sold90: number; // facturas de los ultimos 90 dias
}

export interface ComplementRule {
  useMeasure: boolean;
  triggerCodes: Set<string>; // productos que disparan la regla (ya sin los excluidos)
  // por termino a ofrecer: code -> facturas en que salio junto a algun producto de triggerCodes
  offers: { term: string; candidates: Map<string, number> }[];
}

// code -> codes de complementos (max 4). Solo productos disponibles, que no son variantes (ROTO/SEGUNDA) y que se
// vendieron junto con la regla al menos MIN_PAIR_INVOICES veces; primero los que mas salen juntos.
// Con useMeasure: si el producto tiene medida, solo complementos de ESA medida (un disco de 7" no le sirve a un
// esmeril de 4-1/2"); si no hay de esa medida, ese termino no aporta nada.
export function pickComplements(products: ComplementProduct[], rules: ComplementRule[]): Map<string, string[]> {
  const byCode = new Map(products.map((p) => [p.code, p]));
  const measures = new Map<string, Set<string>>();
  const measuresOf = (p: ComplementProduct) => {
    let m = measures.get(p.code);
    if (!m) measures.set(p.code, (m = storeMeasures(p.name)));
    return m;
  };

  const out = new Map<string, string[]>();
  for (const rule of rules) {
    const offers = rule.offers.map((o) =>
      [...o.candidates]
        .filter(([, pairs]) => pairs >= MIN_PAIR_INVOICES)
        .map(([c, pairs]) => ({ p: byCode.get(c), pairs }))
        .filter((x): x is { p: ComplementProduct; pairs: number } => !!x.p && x.p.available && !VARIANT_RE.test(x.p.name))
        .sort((a, b) => b.pairs - a.pairs || b.p.sold90 - a.p.sold90 || a.p.name.localeCompare(b.p.name))
        .map((x) => x.p),
    );
    for (const code of rule.triggerCodes) {
      const src = byCode.get(code);
      if (!src) continue;
      const picked = out.get(code) ?? [];
      const srcMeasures = rule.useMeasure ? measuresOf(src) : new Set<string>();
      for (const offer of offers) {
        let list = offer.filter((p) => p.code !== code && !picked.includes(p.code));
        if (srcMeasures.size) list = list.filter((p) => sharesMeasure(srcMeasures, measuresOf(p)));
        for (const p of list.slice(0, PER_TERM)) {
          if (picked.length >= MAX_COMPLEMENTS) break;
          picked.push(p.code);
        }
      }
      if (picked.length) out.set(code, picked);
    }
  }
  return out;
}
