/* Genera los iconos PWA desde favicon.png usando solo Node (zlib), sin dependencias.
   Trebol verde centrado sobre fondo blanco con margen. Salidas en apps/web/public/icons/. */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SRC = path.resolve(__dirname, '../favicon.png');
const OUT_DIR = path.resolve(__dirname, '../apps/web/public/icons');

// ---------- CRC32 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- Decode PNG (8-bit RGBA, non-interlaced) ----------
function decodePNG(buf) {
  let p = 8; // skip signature
  let w, h;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.toString('ascii', p, p + 4); p += 4;
    const data = buf.subarray(p, p + len); p += len; p += 4; // skip crc
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error('Solo 8-bit RGBA soportado');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v = (v + a) & 0xff;
      else if (ft === 2) v = (v + b) & 0xff;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 0xff;
      }
      cur[i] = v;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, data: out };
}

// ---------- Encode PNG (8-bit RGBA, filter none) ----------
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Bilinear resample of premultiplied RGBA ----------
function resamplePremul(src, sw, sh, dw, dh) {
  // build premultiplied source floats
  const out = new Float64Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(sh - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(sw - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const i00 = (y0 * sw + x0) * 4 + c, i01 = (y0 * sw + x1) * 4 + c;
        const i10 = (y1 * sw + x0) * 4 + c, i11 = (y1 * sw + x1) * 4 + c;
        // premultiply: rgb * a/255 ; alpha stays
        const a00 = src[(y0 * sw + x0) * 4 + 3], a01 = src[(y0 * sw + x1) * 4 + 3];
        const a10 = src[(y1 * sw + x0) * 4 + 3], a11 = src[(y1 * sw + x1) * 4 + 3];
        const v00 = c < 3 ? (src[i00] * a00) / 255 : a00;
        const v01 = c < 3 ? (src[i01] * a01) / 255 : a01;
        const v10 = c < 3 ? (src[i10] * a10) / 255 : a10;
        const v11 = c < 3 ? (src[i11] * a11) / 255 : a11;
        const top = v00 + (v01 - v00) * fx;
        const bot = v10 + (v11 - v10) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return out; // premultiplied rgb + alpha
}

// ---------- Render one icon: white bg, logo centered at contentFraction ----------
function render(src, size, contentFraction) {
  const aspect = src.w / src.h;
  let cw = Math.round(size * contentFraction), ch = Math.round(cw / aspect);
  if (ch > size * contentFraction) { ch = Math.round(size * contentFraction); cw = Math.round(ch * aspect); }
  const logo = resamplePremul(src.data, src.w, src.h, cw, ch); // premultiplied
  const ox = Math.round((size - cw) / 2), oy = Math.round((size - ch) / 2);
  const out = Buffer.alloc(size * size * 4, 0);
  // white opaque background
  for (let i = 0; i < size * size; i++) { out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255; out[i * 4 + 3] = 255; }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const li = (y * cw + x) * 4;
      const a = logo[li + 3] / 255; // 0..1
      const oi = ((oy + y) * size + (ox + x)) * 4;
      // composite premultiplied-over-white: out = premul_rgb + white*(1-a)
      out[oi]     = Math.round(logo[li]     + 255 * (1 - a));
      out[oi + 1] = Math.round(logo[li + 1] + 255 * (1 - a));
      out[oi + 2] = Math.round(logo[li + 2] + 255 * (1 - a));
      out[oi + 3] = 255;
    }
  }
  return encodePNG(size, size, out);
}

// ---------- main ----------
const src = decodePNG(fs.readFileSync(SRC));
console.log('Fuente:', src.w + 'x' + src.h);
fs.mkdirSync(OUT_DIR, { recursive: true });
const jobs = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-maskable-512.png', 512, 0.60], // safe-area para recorte de Android
  ['apple-touch-icon.png', 180, 0.78],
];
for (const [name, size, frac] of jobs) {
  const png = render(src, size, frac);
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log('  ✓', name, size + 'x' + size, '(' + png.length + ' bytes)');
}
console.log('Listo en', OUT_DIR);
