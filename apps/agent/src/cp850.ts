/**
 * UTF-8 to CP850 (Code Page 850) encoder.
 * Covers ASCII + Spanish characters needed for thermal receipts.
 * No external dependencies.
 */

const CP850_MAP: Record<number, number> = {
  // Spanish-specific
  0x00e1: 0xa0, // á
  0x00e9: 0x82, // é
  0x00ed: 0xa1, // í
  0x00f3: 0xa2, // ó
  0x00fa: 0xa3, // ú
  0x00f1: 0xa4, // ñ
  0x00d1: 0xa5, // Ñ
  0x00c1: 0xb5, // Á
  0x00c9: 0x90, // É
  0x00cd: 0xd6, // Í
  0x00d3: 0xe0, // Ó
  0x00da: 0xe9, // Ú
  0x00bf: 0xa8, // ¿
  0x00a1: 0xad, // ¡
  0x00fc: 0x81, // ü
  0x00dc: 0x9a, // Ü
  // Common symbols
  0x00b0: 0xf8, // °
  0x00aa: 0xa6, // ª
  0x00ba: 0xa7, // º
  0x20ac: 0xd5, // € (CP858 extension, many printers support it)
  0x00a9: 0xb8, // ©
};

export function encodeCP850(text: string): Buffer {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      // ASCII passthrough
      bytes.push(code);
    } else {
      bytes.push(CP850_MAP[code] ?? 0x3f); // '?' for unmapped chars
    }
  }
  return Buffer.from(bytes);
}
