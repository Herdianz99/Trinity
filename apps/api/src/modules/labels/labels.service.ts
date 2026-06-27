import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateLabelsDto } from './dto/generate-labels.dto';
import * as PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';

const MM = 2.834645669; // 1mm en puntos PDF
const MAX_LABELS = 2000; // tope de seguridad

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Etiquetas internas (sin precio): nombre, codigo, ref. proveedor y codigo de
   * barras Code128 (codifica el barcode del producto, o el code si no tiene).
   * Una etiqueta por copia; pagina = tamano de la etiqueta (default 57x40mm).
   */
  async generatePdf(dto: GenerateLabelsDto): Promise<Buffer> {
    if (!dto.items?.length) {
      throw new BadRequestException('No hay productos para etiquetar');
    }

    const totalLabels = dto.items.reduce((s, i) => s + (i.quantity || 0), 0);
    if (totalLabels <= 0) {
      throw new BadRequestException('La cantidad total de etiquetas debe ser mayor a 0');
    }
    if (totalLabels > MAX_LABELS) {
      throw new BadRequestException(
        `Demasiadas etiquetas (${totalLabels}). El maximo por lote es ${MAX_LABELS}.`,
      );
    }

    const widthMm = dto.widthMm && dto.widthMm >= 10 ? dto.widthMm : 57;
    const heightMm = dto.heightMm && dto.heightMm >= 10 ? dto.heightMm : 40;
    const w = widthMm * MM;
    const h = heightMm * MM;

    const ids = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true, supplierRef: true, barcode: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Pre-generar el codigo de barras (PNG) por producto (se reutiliza en cada copia)
    const barcodeCache = new Map<string, Buffer>();
    for (const p of products) {
      // Codificamos el CODIGO interno (lo que se ve en la etiqueta), no el barcode
      // de fabrica, para que el codigo de barras coincida con el "CODIGO" impreso.
      const value = (p.code || p.barcode || '').trim();
      if (!value) continue;
      try {
        const png = await bwipjs.toBuffer({
          bcid: 'code128',
          text: value,
          scale: 3,
          height: 9,
          includetext: true,
          textxalign: 'center',
          textsize: 8,
        });
        barcodeCache.set(p.id, png);
      } catch {
        // si falla la generacion del codigo, la etiqueta sale sin barras
      }
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [w, h], margin: 0 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const border = 3; // inset del borde en pt
      const padX = border + 5;
      const innerW = w - padX * 2;
      const nameMaxH = h * 0.3;

      let first = true;
      const drawLabel = (p: {
        code: string;
        name: string;
        supplierRef: string | null;
        id: string;
      }) => {
        if (!first) doc.addPage({ size: [w, h], margin: 0 });
        first = false;

        // Borde de la etiqueta
        doc
          .lineWidth(0.7)
          .strokeColor('#000000')
          .rect(border, border, w - border * 2, h - border * 2)
          .stroke();

        let y = border + 5;

        // Nombre — auto-ajuste de tamano para que entre en 2 lineas
        doc.font('Helvetica-Bold').fillColor('#000000');
        let nameSize = 10;
        while (nameSize > 6) {
          doc.fontSize(nameSize);
          if (doc.heightOfString(p.name, { width: innerW }) <= nameMaxH) break;
          nameSize -= 0.5;
        }
        doc.fontSize(nameSize).text(p.name, padX, y, {
          width: innerW,
          height: nameMaxH,
          ellipsis: true,
          lineBreak: true,
        });
        y += nameMaxH;

        // Divisor
        doc.moveTo(padX, y).lineTo(padX + innerW, y).lineWidth(0.4).strokeColor('#aaaaaa').stroke();
        y += 4;

        // Codigo + Ref. proveedor en dos columnas, con mini-etiqueta
        const colW = innerW / 2;
        doc.font('Helvetica').fontSize(5.5).fillColor('#888888');
        doc.text('CODIGO', padX, y, { width: colW - 4 });
        doc.text('REF. PROVEEDOR', padX + colW, y, { width: colW });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000000');
        doc.text(p.code, padX, y + 7, { width: colW - 4, ellipsis: true });
        doc.text(p.supplierRef || '—', padX + colW, y + 7, { width: colW, ellipsis: true });
        y += 7 + 12;

        // Codigo de barras (resto del espacio)
        const png = barcodeCache.get(p.id);
        const barcodeBoxH = h - border - 4 - y;
        if (png && barcodeBoxH > 12) {
          doc.image(png, padX, y, {
            fit: [innerW, barcodeBoxH],
            align: 'center',
            valign: 'center',
          });
        }
      };

      for (const item of dto.items) {
        const p = byId.get(item.productId);
        if (!p) continue;
        for (let n = 0; n < item.quantity; n++) {
          drawLabel(p);
        }
      }

      // Si ninguna etiqueta se dibujo (productos inexistentes), pagina vacia con aviso
      if (first) {
        doc.fontSize(8).font('Helvetica').text('Sin productos validos', padX, padX);
      }

      doc.end();
    });
  }
}
