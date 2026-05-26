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

const TAG_RE = /\{\{(\/?[A-Z_]+(?::[0-9]+)?)\}\}/g;

function feedLines(n: number): number[] {
  return [ESC, 0x64, n]; // ESC d n — feed n lines
}

function dashLine(width: number): string {
  return '-'.repeat(width);
}

export function parseMarkupToEscPos(content: string, lineWidth = 48): Buffer {
  const chunks: Buffer[] = [];

  // Prepend INIT + codepage
  chunks.push(Buffer.from([...INIT, ...SET_CP850]));

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
