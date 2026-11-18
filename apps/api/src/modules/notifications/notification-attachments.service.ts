import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { processDocumentImage, parseDataUri } from '../product-images/image-processing';

// Máximo de adjuntos por notificación (invitaciones/afiches: pocos archivos).
const MAX_ATTACHMENTS = 10;

type AttachmentRow = { thumbKey: string; fullKey: string };

// Adjuntos de notificaciones de RRHH (fotos o PDF). Mismo esquema que los adjuntos de compras:
// imagen -> thumb + grande WebP; PDF -> se guarda tal cual. Objetos públicos en Spaces.
@Injectable()
export class NotificationAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  withUrls<T extends AttachmentRow>(att: T) {
    return {
      ...att,
      thumbUrl: this.spaces.cdnUrl(att.thumbKey),
      fullUrl: this.spaces.cdnUrl(att.fullKey),
    };
  }

  // Sube a Spaces ANTES de crear la fila; si la fila falla, compensa los objetos huérfanos.
  async add(notificationId: string, file: string | undefined, fileName?: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, _count: { select: { attachments: true } } },
    });
    if (!notif) throw new NotFoundException('Notificación no encontrada');
    if (notif._count.attachments >= MAX_ATTACHMENTS) {
      throw new BadRequestException(`Máximo ${MAX_ATTACHMENTS} archivos por notificación`);
    }
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    let parsed;
    try {
      parsed = parseDataUri(file);
    } catch {
      throw new BadRequestException('El archivo no es válido');
    }

    const name = fileName?.trim().slice(0, 200) || null;
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const base = `notifications/${notificationId}/${stamp}-${rand}`;

    if (parsed.mime === 'application/pdf') {
      const pdfKey = `${base}.pdf`;
      await this.spaces.uploadPublic(pdfKey, parsed.buffer, 'application/pdf');
      try {
        const att = await this.prisma.notificationAttachment.create({
          data: {
            notificationId,
            thumbKey: pdfKey, // el PDF no tiene miniatura; el front muestra un ícono
            fullKey: pdfKey,
            mimeType: 'application/pdf',
            fileName: name,
            bytes: parsed.buffer.length,
          },
        });
        return this.withUrls(att);
      } catch (e) {
        await this.spaces.delete(pdfKey);
        throw e;
      }
    }

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
      const att = await this.prisma.notificationAttachment.create({
        data: {
          notificationId,
          thumbKey,
          fullKey,
          mimeType: 'image/webp',
          fileName: name,
          bytes: processed.bytes,
        },
      });
      return this.withUrls(att);
    } catch (e) {
      await Promise.all([this.spaces.delete(thumbKey), this.spaces.delete(fullKey)]);
      throw e;
    }
  }

  async remove(notificationId: string, attId: string) {
    const att = await this.prisma.notificationAttachment.findUnique({ where: { id: attId } });
    if (!att || att.notificationId !== notificationId) {
      throw new NotFoundException('Adjunto no encontrado');
    }
    await Promise.all([this.spaces.delete(att.thumbKey), this.spaces.delete(att.fullKey)]);
    await this.prisma.notificationAttachment.delete({ where: { id: attId } });
    return { ok: true };
  }
}
