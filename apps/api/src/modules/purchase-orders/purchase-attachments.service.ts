import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { processDocumentImage, parseDataUri } from '../product-images/image-processing';

@Injectable()
export class PurchaseAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  // Agrega las URLs de CDN a un adjunto.
  private withUrls<T extends { thumbKey: string; fullKey: string }>(att: T) {
    return {
      ...att,
      thumbUrl: this.spaces.cdnUrl(att.thumbKey),
      fullUrl: this.spaces.cdnUrl(att.fullKey),
    };
  }

  // Lista los adjuntos de una factura de compra (más recientes primero).
  async list(purchaseOrderId: string) {
    const items = await this.prisma.purchaseAttachment.findMany({
      where: { purchaseOrderId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true } } },
    });
    return items.map((a) => this.withUrls(a));
  }

  // Sube un adjunto (imagen o PDF, como data URI) a la compra. Se permite en CUALQUIER estado
  // de la compra (incluso PROCESADA) para poder respaldar facturas ya cargadas.
  // Sube a Spaces ANTES de crear la fila; si la fila falla, compensa los objetos huérfanos.
  async add(purchaseOrderId: string, photo: string | undefined, userId: string) {
    const purchase = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true },
    });
    if (!purchase) throw new NotFoundException('Factura de compra no encontrada');
    if (!photo) throw new BadRequestException('No se recibió ningún archivo');

    let parsed;
    try {
      parsed = parseDataUri(photo);
    } catch {
      throw new BadRequestException('El archivo no es válido');
    }

    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const base = `purchases/${purchaseOrderId}/${stamp}-${rand}`;

    // --- PDF: se guarda tal cual (sin procesar con sharp) ---
    if (parsed.mime === 'application/pdf') {
      const pdfKey = `${base}.pdf`;
      await this.spaces.uploadPublic(pdfKey, parsed.buffer, 'application/pdf');
      try {
        const att = await this.prisma.purchaseAttachment.create({
          data: {
            purchaseOrderId,
            thumbKey: pdfKey, // el PDF no tiene miniatura; el front muestra un ícono
            fullKey: pdfKey,
            mimeType: 'application/pdf',
            bytes: parsed.buffer.length,
            uploadedById: userId,
          },
          include: { uploadedBy: { select: { name: true } } },
        });
        return this.withUrls(att);
      } catch (e) {
        await this.spaces.delete(pdfKey);
        throw e;
      }
    }

    // --- Imagen: se procesa a thumb + grande WebP ---
    if (!parsed.mime.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen o un PDF');
    }

    let processed;
    try {
      processed = await processDocumentImage(parsed.buffer);
    } catch {
      throw new BadRequestException('El archivo no es una imagen válida');
    }

    const thumbKey = `${base}-thumb.webp`;
    const fullKey = `${base}-full.webp`;

    await Promise.all([
      this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
      this.spaces.uploadPublic(fullKey, processed.full, 'image/webp'),
    ]);

    try {
      const att = await this.prisma.purchaseAttachment.create({
        data: {
          purchaseOrderId,
          thumbKey,
          fullKey,
          mimeType: 'image/webp',
          bytes: processed.bytes,
          uploadedById: userId,
        },
        include: { uploadedBy: { select: { name: true } } },
      });
      return this.withUrls(att);
    } catch (e) {
      await Promise.all([this.spaces.delete(thumbKey), this.spaces.delete(fullKey)]);
      throw e;
    }
  }

  // Borra un adjunto: elimina los objetos de Spaces y la fila.
  async remove(purchaseOrderId: string, attId: string) {
    const att = await this.prisma.purchaseAttachment.findUnique({ where: { id: attId } });
    if (!att || att.purchaseOrderId !== purchaseOrderId) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    await Promise.all([this.spaces.delete(att.thumbKey), this.spaces.delete(att.fullKey)]);
    await this.prisma.purchaseAttachment.delete({ where: { id: attId } });
    return { ok: true };
  }
}
