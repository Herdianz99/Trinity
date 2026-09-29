import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { StoreExportService } from '../store-export/store-export.service';
import { dataUriToBuffer, processBannerImage } from '../product-images/image-processing';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class StoreCustomizationService {
  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
    private storeExport: StoreExportService,
  ) {}

  /** Lista todos los banners (hero + promo), ordenados para la UI de administración. */
  async findAll() {
    const banners = await this.prisma.storeBanner.findMany({
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return banners.map((b) => this.withUrl(b));
  }

  async findOne(id: string) {
    const banner = await this.prisma.storeBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner no encontrado');
    return this.withUrl(banner);
  }

  async create(dto: CreateBannerDto) {
    const banner = await this.prisma.storeBanner.create({ data: dto });
    this.storeExport.scheduleExport();
    return this.withUrl(banner);
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    const banner = await this.prisma.storeBanner.update({ where: { id }, data: dto });
    this.storeExport.scheduleExport();
    return this.withUrl(banner);
  }

  async remove(id: string) {
    const banner = await this.prisma.storeBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner no encontrado');
    await this.prisma.storeBanner.delete({ where: { id } });
    if (banner.imageKey) await this.spaces.delete(banner.imageKey).catch(() => undefined);
    this.storeExport.scheduleExport();
    return { message: 'Banner eliminado' };
  }

  /** Sube (o reemplaza) la imagen de fondo del banner. */
  async uploadImage(id: string, dataUri: string) {
    const banner = await this.prisma.storeBanner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner no encontrado');

    const raw = dataUriToBuffer(dataUri);
    const { image } = await processBannerImage(raw);

    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const prefix = (process.env.STORE_SNAPSHOT_PREFIX || 'store').replace(/\/+$/, '');
    const key = `${prefix}/banners/${id}/${stamp}-${rand}.webp`;
    await this.spaces.uploadPublic(key, image, 'image/webp');

    const oldKey = banner.imageKey;
    const updated = await this.prisma.storeBanner.update({
      where: { id },
      data: { imageKey: key },
    });
    // Borra la imagen anterior (si la había) sin bloquear la respuesta.
    if (oldKey && oldKey !== key) await this.spaces.delete(oldKey).catch(() => undefined);

    this.storeExport.scheduleExport();
    return this.withUrl(updated);
  }

  /** Resuelve la key de Spaces a URL de CDN para que la UI muestre la imagen. */
  private withUrl<T extends { imageKey: string | null }>(banner: T): T & { imageUrl: string | null } {
    return { ...banner, imageUrl: banner.imageKey ? this.spaces.cdnUrl(banner.imageKey) : null };
  }
}
