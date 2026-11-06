// Totem Clover: convierte la respuesta escrita del bot en algo natural para leer en voz alta.
// El bot escribe "12.50$ bcv" (asi lo verifica el control de precios del API); aqui se vuelve
// "12 dólares con 50 a tasa BCV". Verificacion: node apps/web/src/lib/kiosk-speech.check.ts

function dollars(raw: string): string {
  const [int, dec = '0'] = raw.replace(',', '.').split('.');
  const cents = Number(dec.padEnd(2, '0').slice(0, 2));
  const n = Number(int);
  const unit = n === 1 ? 'dólar' : 'dólares';
  return cents ? `${n} ${unit} con ${cents}` : `${n} ${unit}`;
}

// Une los resultados del reconocimiento de voz. Chrome en PC manda cada trozo nuevo por separado, pero
// Chrome en Android repite en cada resultado TODO lo dicho hasta ahi ("cemento", "cemento gris", ...):
// si se concatenan, sale "cemento cemento gris". Si un trozo empieza con lo acumulado, lo reemplaza;
// si es igual al ultimo, se ignora; si no, se agrega.
export function mergeTranscripts(parts: string[]): string {
  let acc = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const a = acc.toLowerCase();
    const l = p.toLowerCase();
    if (!acc || l.startsWith(a)) acc = p;
    else if (a.endsWith(l)) continue;
    else acc = `${acc} ${p}`;
  }
  return acc;
}

// Constructor (no literal /u): el tsconfig del web apunta a ES5.
const EMOJI = new RegExp('\\p{Extended_Pictographic}', 'gu');

export function textForSpeech(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d+)?)\s*\$\s*bcv/gi, (_, n: string) => `${dollars(n)} a tasa BCV`)
    .replace(/(\d+(?:[.,]\d+)?)\s*\$/g, (_, n: string) => dollars(n))
    .replace(/(\d+(?:\/\d+)?)"/g, '$1 pulgada')
    .replace(/[*_#~`]/g, '')
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim();
}
