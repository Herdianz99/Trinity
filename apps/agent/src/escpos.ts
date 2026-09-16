/**
 * Parses {{TAG}} markup into ESC/POS byte sequences.
 * The web app builds the layout with markup tags; this module
 * translates them into raw printer commands.
 */

import { encodeCP850 } from './cp850';

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;

const INIT = [ESC, 0x40]; // ESC @ — Initialize printer
// FS . — Cancela el modo de caracteres chinos/kanji. Muchas termicas de 80mm vienen
// con "Chinese character: Yes" por defecto: en ese modo tratan TODO byte alto (>=0x80)
// como primer byte de un caracter chino de 2 bytes, asi que se comen la Ñ/tildes (byte
// 0xa5, etc.) JUNTO con la letra siguiente. Al cancelarlo, los bytes altos se imprimen
// como un solo caracter del code page seleccionado (CP850) -> la Ñ y las tildes salen bien.
const CANCEL_KANJI = [0x1c, 0x2e]; // FS .
const SET_CP850 = [ESC, 0x74, 0x02]; // ESC t 2 — Select CP850

const ALIGN_LEFT = [ESC, 0x61, 0x00];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const ALIGN_RIGHT = [ESC, 0x61, 0x02];

const BOLD_ON = [ESC, 0x45, 0x01];
const BOLD_OFF = [ESC, 0x45, 0x00];

// GS ! n — bit 0-3: width, bit 4-7: height
const SIZE_NORMAL = [GS, 0x21, 0x00];
const SIZE_DOUBLE_WH = [GS, 0x21, 0x11]; // BIG: double width + double height
const SIZE_DOUBLE_W = [GS, 0x21, 0x10]; // WIDE: double width only
const SIZE_DOUBLE_H = [GS, 0x21, 0x01]; // TALL: double height only

const PARTIAL_CUT = [GS, 0x56, 0x01]; // GS V 1 — partial cut
const OPEN_DRAWER = [ESC, 0x70, 0x00, 0x19, 0x78]; // ESC p 0 25 120

// El valor tras ':' admite alfanumerico + guiones (para BARCODE con N° de factura tipo
// "NE1-26-00002510"), no solo digitos como FEED:3.
const TAG_RE = /\{\{(\/?[A-Z_]+(?::[^}]+)?)\}\}/g;

function feedLines(n: number): number[] {
  return [ESC, 0x64, n]; // ESC d n — feed n lines
}

// GS k CODE128 — imprime el N° de factura como codigo de barras escaneable en la comanda.
// Se usa la forma "GS k 73 n d1..dn" (m=73 = CODE128) con prefijo de code set {B (0x7B 0x42),
// que cubre ASCII imprimible: digitos, letras y guiones. La alineacion (ESC a) la fija el
// tag {{CENTER}} que envuelve al barcode.
function barcode128(data: string): number[] {
  const clean = (data || '').trim();
  if (!clean) return [];
  const HEIGHT = 60; // GS h n — alto en puntos
  const MODULE = 2; // GS w n — ancho de modulo (2 = fino, cabe ~24 chars en 80mm)
  const HRI_BELOW = 2; // GS H n — numero legible DEBAJO del barcode
  const HRI_FONT = 0; // GS f n — font A para el numero legible
  // {B = code set B; luego los bytes ASCII del texto (se recorta a 7 bits por seguridad).
  const payload = [0x7b, 0x42, ...Array.from(clean, (c) => c.charCodeAt(0) & 0x7f)];
  const n = Math.min(payload.length, 255);
  return [
    GS, 0x68, HEIGHT, // GS h
    GS, 0x77, MODULE, // GS w
    GS, 0x48, HRI_BELOW, // GS H
    GS, 0x66, HRI_FONT, // GS f
    GS, 0x6b, 0x49, n, // GS k 73 n
    ...payload.slice(0, n),
    0x0a, // avance de linea tras el barcode
  ];
}

function dashLine(width: number): string {
  return '-'.repeat(width);
}

export function parseMarkupToEscPos(content: string, lineWidth = 48): Buffer {
  const chunks: Buffer[] = [];

  // Prepend INIT + cancelar modo chino + codepage. El orden importa: INIT (ESC @)
  // resetea la impresora a sus defaults (modo chino ON), asi que FS . debe ir DESPUES.
  chunks.push(Buffer.from([...INIT, ...CANCEL_KANJI, ...SET_CP850]));

  let lastIndex = 0;

  // Replace literal \n (escaped in JSON) with actual newlines
  const text = content.replace(/\\n/g, '\n');

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TAG_RE.exec(text)) !== null) {
    // Push plain text before this tag
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      if (plainText.length > 0) {
        chunks.push(encodeCP850(plainText));
      }
    }

    const tag = match[1]; // e.g. "BOLD", "FEED:3", "/BOLD"

    if (tag === 'CENTER') {
      chunks.push(Buffer.from(ALIGN_CENTER));
    } else if (tag === '/CENTER') {
      chunks.push(Buffer.from(ALIGN_LEFT));
    } else if (tag === 'RIGHT') {
      chunks.push(Buffer.from(ALIGN_RIGHT));
    } else if (tag === '/RIGHT') {
      chunks.push(Buffer.from(ALIGN_LEFT));
    } else if (tag === 'BOLD') {
      chunks.push(Buffer.from(BOLD_ON));
    } else if (tag === '/BOLD') {
      chunks.push(Buffer.from(BOLD_OFF));
    } else if (tag === 'BIG') {
      chunks.push(Buffer.from(SIZE_DOUBLE_WH));
    } else if (tag === '/BIG') {
      chunks.push(Buffer.from(SIZE_NORMAL));
    } else if (tag === 'WIDE') {
      chunks.push(Buffer.from(SIZE_DOUBLE_W));
    } else if (tag === '/WIDE') {
      chunks.push(Buffer.from(SIZE_NORMAL));
    } else if (tag === 'TALL') {
      chunks.push(Buffer.from(SIZE_DOUBLE_H));
    } else if (tag === '/TALL') {
      chunks.push(Buffer.from(SIZE_NORMAL));
    } else if (tag === 'LINE') {
      chunks.push(encodeCP850(dashLine(lineWidth)));
    } else if (tag === 'CUT') {
      chunks.push(Buffer.from(feedLines(4)));
      chunks.push(Buffer.from(PARTIAL_CUT));
    } else if (tag === 'OPEN_DRAWER') {
      chunks.push(Buffer.from(OPEN_DRAWER));
    } else if (tag.startsWith('FEED:')) {
      const n = parseInt(tag.split(':')[1], 10) || 1;
      chunks.push(Buffer.from(feedLines(n)));
    } else if (tag.startsWith('BARCODE:')) {
      const data = tag.slice('BARCODE:'.length);
      const bytes = barcode128(data);
      if (bytes.length > 0) chunks.push(Buffer.from(bytes));
    }
    // Unknown tags are silently ignored

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text after last tag
  if (lastIndex < text.length) {
    chunks.push(encodeCP850(text.substring(lastIndex)));
  }

  return Buffer.concat(chunks);
}
