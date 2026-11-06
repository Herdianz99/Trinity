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

// Voces del navegador ordenadas de mejor a peor para Clover. Lo que mas pesa es la calidad: las
// "Natural"/"Online" (Edge) y las de Google suenan mucho menos roboticas que las del sistema.
// Despues el acento (latino antes que España) y que sea masculina (Clover es un muchacho).
export interface VoiceLike { name: string; lang: string; localService: boolean; voiceURI: string }

const MALE_NAMES = /\b(sebastian|jorge|alonso|gonzalo|alvaro|pablo|raul|emilio|tomas|gerardo|andres|diego|carlos|juan|enrique|federico|lorenzo|manuel|male|hombre)\b/i;
const LANG_SCORE: Record<string, number> = { 've': 8, 'us': 6, 'mx': 5, '419': 5, 'co': 4, 'pe': 4, 'cl': 4, 'ar': 3, 'es': 1 };

export function voiceScore(v: VoiceLike): number {
  const name = v.name.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const region = v.lang.toLowerCase().replace('_', '-').split('-')[1] ?? '';
  let s = 0;
  if (/natural|neural|online|enhanced|premium/i.test(name)) s += 50;
  if (/google/i.test(name)) s += 30;
  if (!v.localService) s += 10;
  s += LANG_SCORE[region] ?? 2;
  if (MALE_NAMES.test(name)) s += 3;
  return s;
}

export function rankVoices<T extends VoiceLike>(voices: T[]): T[] {
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('es'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

// Constructor (no literal /u): el tsconfig del web apunta a ES5.
const EMOJI = new RegExp('\\p{Extended_Pictographic}', 'gu');

export function textForSpeech(text: string): string {
  return text
    .replace(/\$\s*(\d+(?:[.,]\d+)?)\s*bcv/gi, (_, n: string) => `${dollars(n)} a tasa BCV`)
    .replace(/\$\s*(\d+(?:[.,]\d+)?)/g, (_, n: string) => dollars(n))
    .replace(/(\d+(?:[.,]\d+)?)\s*\$\s*bcv/gi, (_, n: string) => `${dollars(n)} a tasa BCV`)
    .replace(/(\d+(?:[.,]\d+)?)\s*\$/g, (_, n: string) => dollars(n))
    .replace(/(\d+(?:\/\d+)?)"/g, '$1 pulgada')
    .replace(/[*_#~`]/g, '')
    .replace(EMOJI, '')
    .replace(/\s+/g, ' ')
    .trim();
}
