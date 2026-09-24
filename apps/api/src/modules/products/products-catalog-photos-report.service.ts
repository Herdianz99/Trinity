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

  private filterText(query: QueryProductsDto, categoryName?: string | null): string {
    const f: string[] = [];
    if (categoryName) f.push(`Categoria: ${categoryName}`);
    if (query.search) f.push(`Busqueda: "${query.search}"`);
    if (query.lowStock) f.push('Solo stock bajo');
    if (query.inStock) f.push('Solo con existencia');
    if (query.isActive === false) f.push('Solo desactivados');
    if (query.saleBlocked) f.push('Solo bloqueados para la venta');
    if (f.length === 0) return 'Todos los articulos (segmentado por categoria)';
    return f.join('  |  ');
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
    // El catalogo con fotos NUNCA muestra articulos desactivados: forzamos solo-activos
    // sin importar los filtros que venga del frontend (includeInactive / isActive).
    const activeQuery: QueryProductsDto = { ...query, isActive: true, includeInactive: false };
    const [config, { items }, category] = await Promise.all([
      this.prisma.companyConfig.findFirst({ select: { companyName: true, logo: true } }),
      this.productsService.catalogReportList(activeQuery),
      query.categoryId
        ? this.prisma.category.findUnique({ where: { id: query.categoryId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const company = config?.companyName || 'Trinity ERP';
    const categoryName = category?.name || null;

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
      `${this.filterText(activeQuery, categoryName)}   |   Generado: ${new Date().toLocaleDateString('es-VE')}   |   ${items.length} articulos`,
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

    // --- Cuadricula de 3 columnas, SEGMENTADA por categoria ---
    const COLS = 3;
    const GUTTER = 16;
    const cardW = (usableW - GUTTER * (COLS - 1)) / COLS; // ~166.7
    const photoH = 120;                 // alto del recuadro de la foto
    const textH = 52;                   // alto del bloque de texto (codigo + nombre + precio)
    const cardH = photoH + textH + 10;  // + padding interno
    const rowGap = 14;
    const bandH = 22;                   // alto de la banda de encabezado de categoria
    const topStart = headerBottom + 14;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    // Empareja cada item con su foto ya transcodificada, agrupa por categoria y ordena:
    // por el ORDEN MANUAL de la categoria (sortOrder, menor primero; 0 al final como el resto),
    // desempatando alfabeticamente; "Sin categoria" siempre al final; dentro de la categoria por nombre.
    const SIN_CAT = 'Sin categoria';
    // orden efectivo: sortOrder>0 va primero por su valor; sortOrder 0 (sin orden asignado) va después.
    const ord = (o: number) => (o > 0 ? o : Number.MAX_SAFE_INTEGER);
    const entries = items.map((it, i) => ({ it, photo: photos[i], cat: it.category || SIN_CAT, order: (it as any).categoryOrder ?? 0 }));
    entries.sort((a, b) => {
      // "Sin categoria" siempre al final.
      if (a.cat !== b.cat) {
        if (a.cat === SIN_CAT) return 1;
        if (b.cat === SIN_CAT) return -1;
        const oa = ord(a.order), ob = ord(b.order);
        if (oa !== ob) return oa - ob;
        return a.cat.localeCompare(b.cat, 'es');
      }
      return a.it.name.localeCompare(b.it.name, 'es');
    });
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.cat, (counts.get(e.cat) || 0) + 1);

    let col = 0;
    let y = topStart;

    // Banda de encabezado de categoria (a todo el ancho). `cont` marca la continuacion
    // de una categoria que salto de pagina.
    const drawCategoryBand = (label: string, cont = false) => {
      doc.roundedRect(marginX, y, usableW, bandH, 4).fillColor('#eef2ff').fill();
      doc.fillColor('#3730a3').fontSize(11).font('Helvetica-Bold').text(
        `${label}${cont ? ' (cont.)' : ''}   (${counts.get(label) || 0})`,
        marginX + 10, y + 6, { width: usableW - 20, lineBreak: false, ellipsis: true },
      );
      y += bandH + 10;
    };

    const drawCard = (it: (typeof entries)[number]['it'], photo: Buffer | null, x: number) => {
      // Marco de la tarjeta
      doc.roundedRect(x, y, cardW, cardH, 6).lineWidth(0.8).strokeColor('#e2e8f0').stroke();

      // Foto (o placeholder)
      const padX = 8;
      const photoBoxX = x + padX;
      const photoBoxY = y + 8;
      const photoBoxW = cardW - padX * 2;
      if (photo) {
        try {
          doc.image(photo, photoBoxX, photoBoxY, { fit: [photoBoxW, photoH], align: 'center', valign: 'center' });
        } catch {
          this.drawNoPhoto(doc, photoBoxX, photoBoxY, photoBoxW, photoH);
        }
      } else {
        this.drawNoPhoto(doc, photoBoxX, photoBoxY, photoBoxW, photoH);
      }

      // Texto: en vez del codigo interno mostramos "ref. proveedor" (esquina izq.) y
      // "otro codigo" (esquina der.), ambos en negrita.
      let ty = photoBoxY + photoH + 6;
      const ref = it.supplierRef || '';
      const other = it.otherCode || '';
      const half = photoBoxW * 0.55;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a');
      if (ref) {
        doc.text(ref, x + padX, ty, { width: half, align: 'left', ellipsis: true, lineBreak: false });
      }
      if (other) {
        doc.text(other, x + padX + (photoBoxW - half), ty, { width: half, align: 'right', ellipsis: true, lineBreak: false });
      }
      if (!ref && !other) {
        doc.text('-', x + padX, ty, { width: photoBoxW, lineBreak: false });
      }
      ty += 12;
      doc.fontSize(7.5).font('Helvetica').fillColor('#475569').text(it.name, x + padX, ty, { width: photoBoxW, height: 18, ellipsis: true });
      ty += 18;
      // Sin existencia: NO mostrar precio (al reponer puede llegar mas caro) -> leyenda "AGOTADO".
      if (it.stock > 0) {
        const priceUsd = `$${this.fmtNum(it.priceDetal)}`;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#15803d').text(priceUsd, x + padX, ty, { width: photoBoxW, lineBreak: false });
      } else {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#dc2626').text('AGOTADO', x + padX, ty, { width: photoBoxW, lineBreak: false });
      }
    };

    let currentCat: string | null = null;
    for (const e of entries) {
      // Nueva categoria: cierra la fila en curso y dibuja la banda de encabezado.
      if (e.cat !== currentCat) {
        if (col !== 0) { col = 0; y += cardH + rowGap; }
        // Evita encabezado huerfano al pie: banda + al menos una tarjeta deben caber.
        if (y + bandH + 10 + cardH > bottomLimit) { doc.addPage(); y = 40; col = 0; }
        drawCategoryBand(e.cat);
        currentCat = e.cat;
      }
      // Salto de pagina dentro de la categoria: repite el encabezado como "(cont.)".
      if (y + cardH > bottomLimit) {
        doc.addPage();
        y = 40;
        col = 0;
        drawCategoryBand(e.cat, true);
      }
      const x = marginX + col * (cardW + GUTTER);
      drawCard(e.it, e.photo, x);
      col++;
      if (col >= COLS) {
        col = 0;
        y += cardH + rowGap;
      }
    }

    // Contraportada: pagina final a todo el ancho (condiciones + promociones). Se agrega ANTES
    // del loop de paginacion (justo tras la cuadricula, sin switchToPage de por medio) para que
    // su contenido quede asociado a su propia pagina; el loop luego la excluye del numerado.
    this.drawBackCover(doc, company);

    // Paginacion al pie: numera solo las paginas de productos (excluye la contraportada = ultima).
    const range = doc.bufferedPageRange();
    const numberedPages = range.count - 1; // -1: la contraportada no lleva numero
    for (let i = 0; i < numberedPages; i++) {
      doc.switchToPage(range.start + i);
      const oldBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
        `Pagina ${i + 1} de ${numberedPages}`, marginX, doc.page.height - 28,
        { align: 'center', width: doc.page.width - marginX * 2 },
      );
      doc.page.margins.bottom = oldBottom;
    }

    doc.end();
    return this.collect(doc);
  }

  // Pagina final: contraportada con las condiciones de pago (contado / credito).
  private drawBackCover(doc: PDFKit.PDFDocument, company: string) {
    doc.addPage();
    // Anula los margenes de ESTA pagina: dibujamos con coordenadas absolutas (bandas al borde);
    // sin esto PDFKit auto-agrega una pagina en blanco al "desbordar" el margen inferior.
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    const W = doc.page.width;   // 612
    const H = doc.page.height;  // 792
    const M = 40;
    const cw = W - M * 2;       // 532
    const INK = '#064e2b';      // verde muy oscuro (bandas)
    const ACCENT = '#009b36';   // verde del logo
    const GREEN = '#15803d';    // verde (badge de descuento)

    // Fondo general
    doc.rect(0, 0, W, H).fill('#f8fafc');

    // --- Banda superior ---
    doc.rect(0, 0, W, 116).fill(INK);
    doc.fillColor('#bbe6c8').font('Helvetica-Bold').fontSize(10)
      .text(company.toUpperCase(), M, 34, { width: cw, align: 'center', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24)
      .text('CONDICIONES DE PAGO', M, 54, { width: cw, align: 'center', lineBreak: false });

    // Dos tarjetas grandes centradas verticalmente con la condicion y su descuento.
    const cardH = 130;
    const gap = 20;
    const startY = 220;
    const condCard = (y: number, titulo: string, detalle: string, badge: string) => {
      doc.roundedRect(M, y, cw, cardH, 14).fillAndStroke('#ffffff', '#e2e8f0');
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(30)
        .text(titulo, M + 30, y + 34, { width: cw - 200, lineBreak: false });
      doc.fillColor('#64748b').font('Helvetica').fontSize(13)
        .text(detalle, M + 30, y + 78, { width: cw - 200, lineBreak: false });
      const badgeW = 150;
      doc.roundedRect(M + cw - badgeW - 24, y + (cardH - 56) / 2, badgeW, 56, 12).fill(GREEN);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(30)
        .text(badge, M + cw - badgeW - 24, y + (cardH - 56) / 2 + 13, { width: badgeW, align: 'center', lineBreak: false });
    };
    condCard(startY, 'CONTADO', 'Pago de contado', '-10%');
    condCard(startY + cardH + gap, '15 DIAS DE CREDITO', 'Pago hasta 15 dias', '-5%');

    // --- Banda inferior ---
    const fy = H - 92;
    doc.rect(0, fy, W, 92).fill(INK);
    doc.fillColor('#bbe6c8').font('Helvetica-Bold').fontSize(12)
      .text('PRECIOS A TASA BINANCE, ZELLE O EFECTIVO', M, fy + 26, { width: cw, align: 'center', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text('@inversioneseltrebol', M, fy + 50, { width: cw, align: 'center', lineBreak: false });
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
