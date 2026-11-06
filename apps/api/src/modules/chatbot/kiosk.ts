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
- No sabes dónde está ubicada la mercancía. Si preguntan dónde está algo, en qué pasillo o "dónde lo consigo", NO des la dirección de la tienda (ya están aquí): di que un vendedor se lo indica con gusto.
- Si quiere comprar, apartar o pagar, dile que un vendedor lo atiende y escala con escalar_a_asesor.
- No llames a enviar_foto: la pantalla ya muestra la foto de lo que cotizas.`;

// Reglas del prompt base pensadas para WhatsApp que chocan con la voz: se reemplaza la LINEA completa que
// empieza con el prefijo. (Agregar reglas al final no basta: en la prueba el bot siguio listando 7 productos.)
const KIOSK_LINE_OVERRIDES: [prefix: string, replacement: string][] = [
  ['Atiendes clientes por WhatsApp',
    'Atiendes clientes EN PERSONA, dentro de la tienda, desde una pantalla con voz (tótem). Tu trabajo: decir si tenemos un producto, cuánto cuesta y pasarle a un vendedor todo lo demás.'],
  ['- Precio en divisas:',
    '- Precio en divisas: NO lo menciones salvo que el cliente pregunte por divisas, dólares en efectivo o descuento; en ese caso usa exactamente precio_divisas. Si dice que lo confirma un asesor, dilo así; no calcules descuentos tú.'],
  ['- FOTOS:', '- FOTOS: no llames a enviar_foto. La pantalla muestra sola la foto y el precio de lo que cotizas.'],
  ['- Si listas varios productos',
    '- Si hay varios productos, nombra máximo 3 (los más comunes y disponibles) en UNA sola frase, cada uno con su precio bcv, y pregunta cuál busca o qué tipo o medida necesita. Nunca hagas listas ni pongas un producto por línea.'],
  ['Cuando escales, despídete',
    'Cuando escales, despídete diciendo que un vendedor lo atiende en un momento. No sigas cotizando después de escalar.'],
  ['- Español de Venezuela, cordial y breve, como un buen vendedor por WhatsApp.',
    '- Español de Venezuela, cordial y breve, como un buen vendedor en el mostrador. Trata al cliente de "tú" siempre (nunca "usted" ni "le").'],
];

// Prompt del totem: el de WhatsApp con las lineas de arriba cambiadas + reglas de voz al final.
export function adaptPromptForKiosk(base: string): string {
  const lines = base.split('\n').map((line) => KIOSK_LINE_OVERRIDES.find(([p]) => line.startsWith(p))?.[1] ?? line);
  return lines.join('\n') + KIOSK_VOICE_RULES;
}

const priceRe =/\d+(?:[.,]\d+)?\s*\$/g;
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
