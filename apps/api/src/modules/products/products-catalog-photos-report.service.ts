import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { QueryProductsDto } from './dto/query-products.dto';

// sharp: las fotos de producto viven en la CDN en formato WebP, y PDFKit NO soporta WebP
// (solo JPEG/PNG). Por eso cada foto se descarga y se transcodifica a JPEG antes de incrustarla.
const sharp = require('sharp') as typeof import('sharp').default;

// Catalogo VISUAL de productos (pantalla /catalog/products): logo de la empresa arriba y una
// cuadricula de 3 columnas con la foto de cada producto, su codigo y su precio. Respeta los
// mismos filtros que la tabla (via catalogReportList).
@Injectable()
export class ProductsCatalogPhotosReportService {
  private readonly logger = new Logger(ProductsCatalogPhotosReportService.name);

  // Cache en memoria de las fotos ya convertidas a JPEG (por URL). Las miniaturas pesan poco
  // (~5-15 KB), asi que la primera generacion las descarga/convierte y las siguientes son casi
  // instantaneas mientras viva el proceso. Solo se cachean exitos (un fallo transitorio se
  // reintenta la proxima vez). Tope simple con desalojo del mas antiguo (Map = orden de insercion).
  private static readonly imageCache = new Map<string, Buffer>();
  private static readonly CACHE_MAX = 4000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  private fmtNum(n: number, dec = 2): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  private filterText(query: QueryProductsDto): string {
    const f: string[] = [];
    if (query.search) f.push(`Busqueda: "${query.search}"`);
    if (query.lowStock) f.push('Solo stock bajo');
    if (query.inStock) f.push('Solo con existencia');
    if (query.isActive === false) f.push('Solo desactivados');
    if (query.saleBlocked) f.push('Solo bloqueados para la venta');
    return f.length ? f.join('  |  ') : 'Todos los articulos';
  }

  // Descarga una foto WebP de la CDN y la transcodifica a JPEG (buffer) para PDFKit.
  // Devuelve null si falla (foto faltante, timeout o formato invalido) → se dibuja un placeholder.
  private async fetchImageJpeg(url: string): Promise<Buffer | null> {
    if (!url) return null;
    const cache = ProductsCatalogPhotosReportService.imageCache;
    const cached = cache.get(url);
    if (cached) return cached;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const raw = Buffer.from(await res.arrayBuffer());
      // Fondo blanco por si la imagen trae transparencia (WebP/PNG).
      const jpeg = await sharp(raw, { failOn: 'none' })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88 })
        .toBuffer();
      // Guarda en cache (desaloja el mas antiguo si se llena).
      if (cache.size >= ProductsCatalogPhotosReportService.CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(url, jpeg);
      return jpeg;
    } catch (err) {
      this.logger.warn(`No se pudo cargar la foto ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  // Descarga/transcodifica en paralelo con un tope de concurrencia (protege memoria y la CDN).
  private async mapLimit<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let idx = 0;
    const worker = async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  async generatePdf(query: QueryProductsDto): Promise<Buffer> {
    const [config, { items, rate }] = await Promise.all([
      this.prisma.companyConfig.findFirst({ select: { companyName: true, logo: true } }),
      this.productsService.catalogReportList(query),
    ]);
    const company = config?.companyName || 'Trinity ERP';

    // Pre-descarga todas las fotos (transcodificadas a JPEG) antes de dibujar.
    const photos = await this.mapLimit(items, 6, (it) => this.fetchImageJpeg(it.imageUrl));

    const doc = new PDFDocument({
      size: 'LETTER',
      layout: 'portrait',
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      bufferPages: true,
    });

    const pageW = doc.page.width;   // 612
    const marginX = 40;
    const usableW = pageW - marginX * 2; // 532

    // --- Encabezado con logo ---
    let hasLogo = false;
    if (config?.logo) {
      try {
        const logoBuffer = Buffer.from(config.logo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        doc.image(logoBuffer, marginX, 34, { height: 46 });
        hasLogo = true;
      } catch { /* logo invalido: se omite */ }
    }
    const textX = hasLogo ? marginX + 60 : marginX;
    const textW = usableW - (hasLogo ? 60 : 0);
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a').text(company, textX, 36, { width: textW });
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#334155').text('Catalogo de productos', textX, 58, { width: textW });
    doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(
      `${this.filterText(query)}   |   Generado: ${new Date().toLocaleDateString('es-VE')}   |   ${items.length} articulos${rate > 0 ? `   |   Tasa: ${this.fmtNum(rate)} Bs/$` : ''}`,
      textX, 74, { width: textW },
    );
    const headerBottom = 92;
    doc.moveTo(marginX, headerBottom).lineTo(pageW - marginX, headerBottom).strokeColor('#cbd5e1').lineWidth(1).stroke();

    if (items.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#64748b').text(
        'No se encontraron articulos con los filtros aplicados.',
        marginX, headerBottom + 30, { width: usableW, align: 'center' },
      );
      doc.end();
      return this.collect(doc);
    }

    // --- Cuadricula de 3 columnas ---
    const COLS = 3;
    const GUTTER = 16;
    const cardW = (usableW - GUTTER * (COLS - 1)) / COLS; // ~166.7
    const photoH = 120;                 // alto del recuadro de la foto
    const textH = 52;                   // alto del bloque de texto (codigo + nombre + precio)
    const cardH = photoH + textH + 10;  // + padding interno
    const rowGap = 14;
    const topStart = headerBottom + 14;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    let col = 0;
    let y = topStart;

    const drawCard = (i: number) => {
      const it = items[i];
      const x = marginX + col * (cardW + GUTTER);

      // Marco de la tarjeta
      doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.8).strokeColor('#e2e8f0').stroke();

      // Foto (o placeholder)
      const padX = 8;
      const photoBoxX = x + padX;
      const photoBoxY = y + 8;
      const photoBoxW = cardW - padX * 2;
      const buf = photos[i];
      if (buf) {
        try {
          doc.image(buf, photoBoxX, photoBoxY, { fit: [photoBoxW, photoH], align: 'center', valign: 'center' });
        } catch {
          this.drawNoPhoto(doc, photoBoxX, photoBoxY, photoBoxW, photoH);
        }
      } else {
        this.drawNoPhoto(doc, photoBoxX, photoBoxY, photoBoxW, photoH);
      }

      // Texto
      let ty = photoBoxY + photoH + 6;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a').text(it.code, x + padX, ty, { width: photoBoxW, ellipsis: true, lineBreak: false });
      ty += 12;
      doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text(it.name, x + padX, ty, { width: photoBoxW, height: 18, ellipsis: true });
      ty += 18;
      const priceUsd = `$${this.fmtNum(it.priceDetal)}`;
      const priceBs = rate > 0 ? `   Bs ${this.fmtNum(it.priceDetalBs)}` : '';
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#15803d').text(priceUsd, x + padX, ty, { width: photoBoxW, continued: rate > 0, lineBreak: false });
      if (rate > 0) doc.fontSize(8).font('Helvetica').fillColor('#334155').text(priceBs, { lineBreak: false });
    };

    for (let i = 0; i < items.length; i++) {
      // Salto de pagina cuando la fila no cabe.
      if (y + cardH > bottomLimit) {
        doc.addPage();
        y = 40;
        col = 0;
      }
      drawCard(i);
      col++;
      if (col >= COLS) {
        col = 0;
        y += cardH + rowGap;
      }
    }

    // Paginacion al pie.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
        `Pagina ${i + 1} de ${range.count}`, marginX, doc.page.height - 28,
        { align: 'center', width: doc.page.width - marginX * 2 },
      );
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    return this.collect(doc);
  }

  // Recuadro gris con la leyenda "Sin foto" cuando el producto no tiene imagen.
  private drawNoPhoto(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
    doc.rect(x, y, w, h).fillColor('#f1f5f9').fill();
    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('Sin foto', x, y + h / 2 - 4, { width: w, align: 'center' });
    doc.fillColor('#000');
  }

  private collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
