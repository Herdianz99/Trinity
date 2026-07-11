// Convierte "asiento p/poceta" -> "asiento:* & poceta:*" para to_tsquery: exige TODAS
// las palabras (AND), en cualquier orden y como prefijo, sin acentos ni simbolos.
// El Product.searchVector se indexa normalizado igual (separadores -> espacio, unaccent),
// asi que TODAS las busquedas de producto (POS, compra, articulos, ajustes, conteos)
// deben construir su tsquery con esta funcion para comportarse igual.
export function productSearchTsQuery(raw: string): string {
  const tokens = (raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.map((t) => `${t}:*`).join(' & ');
}
