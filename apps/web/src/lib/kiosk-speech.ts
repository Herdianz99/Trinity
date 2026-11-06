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
