import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TotemAd, TotemMedia } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { InvoicesService } from '../invoices/invoices.service';
import { ChatbotService } from '../chatbot/chatbot.service';
import { TotemCallsService } from '../chatbot/totem-calls.service';
import { TotemMediaService } from './totem-media.service';
import { CreateTotemAdDto, UpdateTotemAdDto, UpdateTotemConfigDto } from './dto/totem.dto';

type AdWithRels = TotemAd & {
  media: TotemMedia | null;
  product: {
    id: string; code: string; name: string; priceDetal: number; isActive: boolean; saleBlocked: boolean;
    isService: boolean; primaryImageMediumUrl: string | null; primaryImageThumbUrl: string | null;
  } | null;
};

export type AdStatus = 'ACTIVE' | 'PAUSED' | 'SCHEDULED' | 'EXPIRED' | 'PROCESSING' | 'FAILED' | 'SOLD_OUT' | 'NO_MEDIA';

const PRODUCT_SELECT = {
  id: true, code: true, name: true, priceDetal: true, isActive: true, saleBlocked: true, isService: true,
  primaryImageMediumUrl: true, primaryImageThumbUrl: true,
} as const;

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateOrNull = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const priceLabel = (usd: number) => `$${(Math.round(usd * 100) / 100).toFixed(2)}`;

@Injectable()
export class TotemService {
  constructor(
    private prisma: PrismaService,
    private invoices: InvoicesService,
    private chatbot: ChatbotService,
    private totemCalls: TotemCallsService,
    private media: TotemMediaService,
  ) {}

  // ---------- Conversaciones del totem (solo canal KIOSK, solo las propias) ----------

  createConversation(userId: string) {
    return this.chatbot.createConversation(userId, 'KIOSK');
  }

  private async assertOwnKiosk(id: string, userId: string) {
    const conv = await this.prisma.chatbotConversation.findUnique({ where: { id }, select: { channel: true, createdById: true } });
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    if (conv.channel !== 'KIOSK' || conv.createdById !== userId) throw new ForbiddenException('Conversación no permitida');
  }

  async reply(id: string, userId: string, text: string) {
    await this.assertOwnKiosk(id, userId);
    return this.chatbot.reply(id, text, []);
  }

  async callSeller(id: string, userId: string) {
    await this.assertOwnKiosk(id, userId);
    return this.chatbot.callSeller(id);
  }

  async callStatus(id: string, userId: string) {
    await this.assertOwnKiosk(id, userId);
    return this.totemCalls.statusForTotem(id);
  }

  // ---------- Configuracion ----------

  private async getConfig() {
    return this.prisma.totemConfig.upsert({
      where: { id: 'default' }, update: {}, create: { id: 'default' }, include: { introMedia: true },
    });
  }

  async configView() {
    const c = await this.getConfig();
    return { idleSeconds: c.idleSeconds, showCallToAction: c.showCallToAction, introMediaId: c.introMediaId, introMedia: c.introMedia };
  }

  async updateConfig(dto: UpdateTotemConfigDto) {
    const prev = await this.getConfig();
    if (dto.introMediaId) {
      const m = await this.prisma.totemMedia.findUnique({ where: { id: dto.introMediaId } });
      if (!m || m.kind !== 'VIDEO') throw new BadRequestException('La presentación debe ser un video subido al tótem.');
    }
    await this.prisma.totemConfig.update({
      where: { id: 'default' },
      data: {
        ...(dto.idleSeconds !== undefined ? { idleSeconds: dto.idleSeconds } : {}),
        ...(dto.showCallToAction !== undefined ? { showCallToAction: dto.showCallToAction } : {}),
        ...(dto.introMediaId !== undefined ? { introMediaId: dto.introMediaId } : {}),
      },
    });
    // La presentacion anterior queda sin uso: se borra para no acumular espacio.
    if (dto.introMediaId !== undefined && prev.introMediaId && prev.introMediaId !== dto.introMediaId) {
      await this.deleteMediaIfUnused(prev.introMediaId);
    }
    return this.configView();
  }

  // ---------- Anuncios ----------

  private async freeStock(productIds: string[]): Promise<Record<string, number>> {
    if (!productIds.length) return {};
    const rows = await this.prisma.stock.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, warehouse: { countsForSale: true } },
      _sum: { quantity: true },
    });
    const reserved = await this.invoices.getReservedStock();
    const out: Record<string, number> = {};
    for (const id of productIds) out[id] = 0;
    for (const r of rows) out[r.productId] = Number(r._sum.quantity || 0) - (reserved[r.productId] || 0);
    return out;
  }

  private productAvailable(p: AdWithRels['product'], free: Record<string, number>) {
    return !!p && p.isActive && !p.saleBlocked && p.priceDetal > 0 && (p.isService || (free[p.id] ?? 0) > 0);
  }

  private adStatus(ad: AdWithRels, today: Date, free: Record<string, number>): AdStatus {
    if (ad.endDate && ad.endDate < today) return 'EXPIRED';
    if (ad.type !== 'PRODUCT') {
      if (!ad.media) return 'NO_MEDIA';
      if (ad.media.status === 'PROCESSING') return 'PROCESSING';
      if (ad.media.status === 'FAILED') return 'FAILED';
    } else if (ad.media?.status === 'PROCESSING') {
      return 'PROCESSING';
    }
    if (!ad.isActive) return 'PAUSED';
    if (ad.startDate && ad.startDate > today) return 'SCHEDULED';
    if (ad.type === 'PRODUCT' && !this.productAvailable(ad.product, free)) return 'SOLD_OUT';
    return 'ACTIVE';
  }

  private async loadAds(where: Prisma.TotemAdWhereInput = {}) {
    return this.prisma.totemAd.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { media: true, product: { select: PRODUCT_SELECT } },
    }) as Promise<AdWithRels[]>;
  }

  async listAds() {
    const today = caracasDateKey();
    const ads = await this.loadAds();
    const free = await this.freeStock(ads.filter((a) => a.productId).map((a) => a.productId!));
    return ads.map((a) => ({
      id: a.id, type: a.type, title: a.title, isActive: a.isActive, sortOrder: a.sortOrder,
      startDate: ymd(a.startDate), endDate: ymd(a.endDate), durationSec: a.durationSec,
      status: this.adStatus(a, today, free),
      media: a.media,
      product: a.product ? {
        id: a.product.id, code: a.product.code, name: a.product.name, price: priceLabel(a.product.priceDetal),
        imageUrl: a.product.primaryImageMediumUrl || a.product.primaryImageThumbUrl,
      } : null,
    }));
  }

  private async validateRefs(type: string, mediaId: string | null | undefined, productId: string | null | undefined) {
    if (mediaId) {
      const m = await this.prisma.totemMedia.findUnique({ where: { id: mediaId } });
      if (!m) throw new BadRequestException('El archivo no existe');
      if (type === 'VIDEO' && m.kind !== 'VIDEO') throw new BadRequestException('Este anuncio necesita un video');
      if ((type === 'IMAGE' || type === 'PRODUCT') && m.kind !== 'IMAGE') throw new BadRequestException('Este anuncio necesita una imagen');
    }
    if (productId) {
      const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { name: true } });
      if (!p) throw new BadRequestException('El producto no existe');
      return p.name;
    }
    return null;
  }

  async createAd(dto: CreateTotemAdDto, userId: string) {
    if (dto.type === 'PRODUCT' && !dto.productId) throw new BadRequestException('Elige un producto');
    if (dto.type !== 'PRODUCT' && !dto.mediaId) throw new BadRequestException('Sube el archivo del anuncio');
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) throw new BadRequestException('La fecha de fin es antes del inicio');
    const productName = await this.validateRefs(dto.type, dto.mediaId, dto.type === 'PRODUCT' ? dto.productId : null);
    let title = dto.title?.trim();
    if (!title) {
      if (productName) title = productName;
      else {
        const m = await this.prisma.totemMedia.findUnique({ where: { id: dto.mediaId! }, select: { originalName: true } });
        title = (m?.originalName || 'Anuncio').replace(/\.[a-z0-9]+$/i, '');
      }
    }
    const last = await this.prisma.totemAd.aggregate({ _max: { sortOrder: true } });
    await this.prisma.totemAd.create({
      data: {
        type: dto.type, title: title.slice(0, 120), mediaId: dto.mediaId ?? null,
        productId: dto.type === 'PRODUCT' ? dto.productId! : null,
        isActive: dto.isActive ?? true, startDate: dateOrNull(dto.startDate), endDate: dateOrNull(dto.endDate),
        durationSec: dto.durationSec ?? 8, sortOrder: (last._max.sortOrder ?? 0) + 1, createdById: userId,
      },
    });
    return this.listAds();
  }

  async updateAd(id: string, dto: UpdateTotemAdDto) {
    const ad = await this.prisma.totemAd.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Anuncio no encontrado');
    if (ad.type !== 'PRODUCT' && dto.mediaId === null) throw new BadRequestException('Este anuncio necesita su archivo');
    if (ad.type === 'PRODUCT' && dto.productId === null) throw new BadRequestException('Elige un producto');
    await this.validateRefs(ad.type, dto.mediaId, ad.type === 'PRODUCT' ? dto.productId : null);
    const start = dto.startDate !== undefined ? dto.startDate : ymd(ad.startDate);
    const end = dto.endDate !== undefined ? dto.endDate : ymd(ad.endDate);
    if (start && end && end < start) throw new BadRequestException('La fecha de fin es antes del inicio');
    await this.prisma.totemAd.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim().slice(0, 120) || ad.title } : {}),
        ...(dto.mediaId !== undefined ? { mediaId: dto.mediaId } : {}),
        ...(ad.type === 'PRODUCT' && dto.productId !== undefined ? { productId: dto.productId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.startDate !== undefined ? { startDate: dateOrNull(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: dateOrNull(dto.endDate) } : {}),
        ...(dto.durationSec !== undefined ? { durationSec: dto.durationSec } : {}),
      },
    });
    if (dto.mediaId !== undefined && ad.mediaId && ad.mediaId !== dto.mediaId) await this.deleteMediaIfUnused(ad.mediaId);
    return this.listAds();
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.totemAd.updateMany({ where: { id }, data: { sortOrder: i + 1 } })));
    return this.listAds();
  }

  async deleteAd(id: string) {
    const ad = await this.prisma.totemAd.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Anuncio no encontrado');
    await this.prisma.totemAd.delete({ where: { id } });
    if (ad.mediaId) await this.deleteMediaIfUnused(ad.mediaId);
    return this.listAds();
  }

  // ---------- Archivos ----------

  private async deleteMediaIfUnused(mediaId: string) {
    const m = await this.prisma.totemMedia.findUnique({
      where: { id: mediaId }, include: { _count: { select: { ads: true, introOf: true } } },
    });
    if (!m || m._count.ads > 0 || m._count.introOf > 0) return 0;
    await this.prisma.totemMedia.delete({ where: { id: mediaId } });
    await this.media.deleteMediaFiles(m);
    return m.bytes;
  }

  async listMedia() {
    const today = caracasDateKey();
    const rows = await this.prisma.totemMedia.findMany({
      orderBy: { createdAt: 'desc' },
      include: { ads: { select: { id: true, title: true, isActive: true, endDate: true } }, introOf: { select: { id: true } } },
    });
    const files = rows.map(({ ads, introOf, ...m }) => {
      const isIntro = introOf.length > 0;
      const expired = ads.length > 0 && !isIntro && ads.every((a) => a.endDate && a.endDate < today);
      return {
        ...m,
        isIntro,
        ads: ads.map((a) => ({ id: a.id, title: a.title, isActive: a.isActive, expired: !!a.endDate && a.endDate < today })),
        usage: isIntro ? 'INTRO' : ads.length === 0 ? 'UNUSED' : expired ? 'EXPIRED' : 'IN_USE',
      };
    });
    const sum = (list: typeof files) => list.reduce((s, f) => s + f.bytes, 0);
    const expiredAds = await this.prisma.totemAd.count({ where: { endDate: { lt: today } } });
    return {
      files,
      totalBytes: sum(files),
      expired: { ads: expiredAds, bytes: sum(files.filter((f) => f.usage === 'EXPIRED')) },
      unused: { files: files.filter((f) => f.usage === 'UNUSED').length, bytes: sum(files.filter((f) => f.usage === 'UNUSED')) },
    };
  }

  /** Borra archivos: los anuncios de imagen/video que los usan se borran tambien (sin archivo no sirven). */
  async deleteMedia(ids: string[]) {
    let bytes = 0;
    let deleted = 0;
    for (const id of ids) {
      const m = await this.prisma.totemMedia.findUnique({ where: { id } });
      if (!m) continue;
      if (m.status === 'PROCESSING') throw new ConflictException('Hay un video procesándose; espera a que termine.');
      await this.prisma.$transaction([
        this.prisma.totemAd.deleteMany({ where: { mediaId: id, type: { in: ['IMAGE', 'VIDEO'] } } }),
        this.prisma.totemConfig.updateMany({ where: { introMediaId: id }, data: { introMediaId: null } }),
        this.prisma.totemMedia.delete({ where: { id } }),
      ]);
      await this.media.deleteMediaFiles(m);
      bytes += m.bytes;
      deleted += 1;
    }
    return { deleted, bytes };
  }

  /** Borra los anuncios vencidos y los archivos que se quedan sin uso. */
  async cleanupExpired() {
    const today = caracasDateKey();
    const ads = await this.prisma.totemAd.findMany({ where: { endDate: { lt: today } }, select: { id: true, mediaId: true } });
    await this.prisma.totemAd.deleteMany({ where: { id: { in: ads.map((a) => a.id) } } });
    let bytes = 0;
    for (const mediaId of new Set(ads.map((a) => a.mediaId).filter((x): x is string => !!x))) {
      bytes += await this.deleteMediaIfUnused(mediaId);
    }
    return { ads: ads.length, bytes };
  }

  // ---------- Lo que pasa el totem en espera ----------

  async playlist() {
    const today = caracasDateKey();
    const cfg = await this.getConfig();
    const ads = await this.loadAds({
      isActive: true,
      OR: [{ startDate: null }, { startDate: { lte: today } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: today } }] }],
    });
    const free = await this.freeStock(ads.filter((a) => a.productId).map((a) => a.productId!));
    const items = ads
      .filter((a) => this.adStatus(a, today, free) === 'ACTIVE')
      .map((a) => {
        const own = a.media?.status === 'READY' ? a.media : null;
        if (a.type === 'PRODUCT') {
          const p = a.product!;
          return {
            id: a.id, type: a.type, durationSec: a.durationSec,
            url: own?.url || p.primaryImageMediumUrl || p.primaryImageThumbUrl || null,
            product: { code: p.code, name: p.name, price: priceLabel(p.priceDetal) },
          };
        }
        return {
          id: a.id, type: a.type, durationSec: a.durationSec, url: own!.url, thumbUrl: own!.thumbUrl,
          width: own!.width, height: own!.height,
        };
      });
    const intro = cfg.introMedia?.status === 'READY'
      ? { url: cfg.introMedia.url, thumbUrl: cfg.introMedia.thumbUrl, width: cfg.introMedia.width, height: cfg.introMedia.height }
      : null;
    return { idleSeconds: cfg.idleSeconds, showCallToAction: cfg.showCallToAction, intro, items };
  }
}
