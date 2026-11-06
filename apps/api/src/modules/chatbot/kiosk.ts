// Totem de voz Clover (piso de venta). Logica pura: sin Nest ni Prisma, para poder verificarla con node
// (ver kiosk.check.ts).

export interface KioskToolCall { name: string; input: unknown; result: unknown }
export interface KioskProduct { codigo: string; nombre: string; precio_bcv: string; disponible: boolean; tiene_foto: boolean }

const MAX_CARDS = 4;

// Se agrega al system prompt cuando el canal es KIOSK. Los precios se siguen escribiendo con numero y "$"
// (los verifica price-guard); la pantalla los convierte a palabras solo para la voz.
export const KIOSK_VOICE_RULES = `

MODO TÓTEM DE VOZ (esta conversación es en la tienda, no por WhatsApp; estas reglas mandan sobre las anteriores)
- Te llamas Clover. Estás en una pantalla en el piso de venta: el cliente te HABLA y tu respuesta se lee en voz alta y se muestra en pantalla.
- Responde en 1 a 3 frases cortas. Nada de listas, viñetas, emojis ni saltos de línea.
- Si hay varias opciones, nombra máximo 3 en una sola frase con su precio y pregunta cuál le interesa (la pantalla muestra las fotos).
- Escribe los precios como siempre (número con "$" y "bcv"); no los escribas en letras.
- Lo que te dicen viene de un reconocimiento de voz y puede venir mal escrito: si no tiene sentido, pide amablemente que lo repita.
- El cliente YA está en la tienda: no ofrezcas delivery ni pidas teléfono o datos de contacto.
- No sabes dónde está ubicada la mercancía: si preguntan en qué pasillo o dónde está algo, di que un vendedor se lo indica con gusto.
- Si quiere comprar, apartar o pagar, dile que un vendedor lo atiende y escala con escalar_a_asesor.
- No llames a enviar_foto: la pantalla ya muestra la foto de lo que cotizas.`;

const priceRe = /\d+(?:[.,]\d+)?\s*\$/g;
const normPrice = (s: string) => s.replace(/\s+/g, '').replace(',', '.');
const words = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9/.]+/).filter((w) => w.length > 1);

// Productos que el bot COTIZO en esta respuesta: los de buscar_productos cuyo precio aparece en el texto,
// en el orden en que se mencionan. Si dos comparten precio, gana el que mas palabras de su nombre trae el texto.
export function pickMentionedProducts(toolLog: KioskToolCall[], text: string): KioskProduct[] {
  const products: KioskProduct[] = toolLog
    .filter((t) => t.name === 'buscar_productos')
    .flatMap((t) => (t.result as { productos?: KioskProduct[] } | null)?.productos ?? []);
  if (!products.length) return [];
  const textWords = new Set(words(text));
  const score = (p: KioskProduct) => words(p.nombre).filter((w) => textWords.has(w)).length;

  const picked: KioskProduct[] = [];
  for (const m of text.matchAll(priceRe)) {
    const price = normPrice(m[0]);
    const candidates = products.filter(
      (p) => normPrice(String(p.precio_bcv).split(' ')[0]) === price && !picked.some((x) => x.codigo === p.codigo),
    );
    if (!candidates.length) continue;
    picked.push(candidates.sort((a, b) => score(b) - score(a))[0]);
    if (picked.length >= MAX_CARDS) break;
  }
  return picked;
}
