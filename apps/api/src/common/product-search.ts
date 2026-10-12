// Convierte "asiento p/poceta" -> "asiento:* & poceta:*" para to_tsquery: exige TODAS
// las palabras (AND), en cualquier orden y como prefijo, sin acentos ni simbolos.
// El Product.searchVector se indexa normalizado igual (separadores -> espacio, unaccent),
// asi que TODAS las busquedas de producto (POS, compra, articulos, ajustes, conteos)
// deben construir su tsquery con esta funcion para comportarse igual.
// Fracciones: "3/8" -> token exacto "3f8" (el indice guarda "3 8 3f8", ver product_search_normalize),
// asi "llave 1/2" ya no trae "2 X 1" ni "12". Escribir "1 2" sigue buscando como antes.
// Medidas: "2x1", "2 x 1" y "2 X 1" -> token EXACTO "2x1" (el indice guarda "2 1 2x1"); exacto para que
// "2x1" no traiga "2x10". No aplica a fracciones ("1/2 x 3/4" sigue como 1f2, x, 3f4).
// El indice tambien incluye Product.searchKeywords (sinonimos activos).
const DIMENSION_RE = /^\d+x\d+$/;

export function productSearchTsQuery(raw: string): string {
  const tokens = (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/(?<![a-z0-9/.])(\d+)\s*x\s*(\d+)(?![a-z0-9/])/g, '$1x$2')
    .replace(/(\d+)\/(\d+)/g, '$1f$2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.map((t) => (DIMENSION_RE.test(t) ? t : `${t}:*`)).join(' & ');
}
