import * as cheerio from 'cheerio';

export const INGCO_BASE = 'https://www.ingco.com/ve/product/x/';

/** Código tal cual: solo recorta espacios. NO quita prefijos (U, ING-) que son parte del código real. */
export function cleanCode(ref: string): string {
  return ref.trim();
}

export function buildProductUrl(model: string): string {
  return INGCO_BASE + encodeURIComponent(cleanCode(model));
}

/** <title> sin el sufijo " - INGCO Venezuela". null si viene vacío (modelo inexistente). */
export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const raw = $('title').first().text().replace(/\s*-\s*INGCO Venezuela\s*$/i, '').trim();
  return raw.length ? raw : null;
}

/** Texto del div .parameter-content, con <br> -> salto de línea. null si no existe. */
export function extractDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const inner = $('.parameter-content').first().html();
  if (!inner) return null;
  const withBreaks = inner.replace(/<br\s*\/?>/gi, '\n');
  const text = cheerio.load(`<div>${withBreaks}</div>`)('div').text();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length ? lines.join('\n') : null;
}

/** Primera URL de productPicList en g_initialProps, desescapando / y \/ . null si no hay. */
export function extractImageUrl(html: string): string | null {
  const i = html.indexOf('"productPicList"');
  if (i === -1) return null;
  const slice = html.slice(i, i + 4000); // el array es corto; acotamos por seguridad
  const m = slice.match(/https?:[^"]+?\.(?:jpg|jpeg|png|webp)/i);
  if (!m) return null;
  return m[0]
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\/g, '');
}

export interface IngcoProduct {
  title: string;
  description: string | null;
  imageUrl: string | null;
}

/** Combina las tres extracciones. Guarda dura: título vacío => null (no-match). */
export function parseIngcoPage(html: string): IngcoProduct | null {
  const title = extractTitle(html);
  if (!title) return null;
  return {
    title,
    description: extractDescription(html),
    imageUrl: extractImageUrl(html),
  };
}
