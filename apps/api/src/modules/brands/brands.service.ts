import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { StoreExportService } from '../store-export/store-export.service';
import { dataUriToBuffer, processLogoImage } from '../product-images/image-processing';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
    private storeExport: StoreExportService,
  ) {}

  async create(dto: CreateBrandDto) {
    const brand = await this.prisma.brand.create({ data: dto });
    this.storeExport.scheduleExport();
    return this.withLogoUrl(brand);
  }

  async findAll() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return brands.map((b) => this.withLogoUrl(b));
  }

  async findOne(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    return this.withLogoUrl(brand);
  }

  async update(id: string, dto: UpdateBrandDto) {
    await this.ensureExists(id);
    const brand = await this.prisma.brand.update({ where: { id }, data: dto });
    this.storeExport.scheduleExport(); // el nombre afecta el slug en la tienda
    return this.withLogoUrl(brand);
  }

  async remove(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    if (brand._count.products > 0) {
      throw new BadRequestException('No se puede eliminar una marca con productos asociados');
    }
    await this.prisma.brand.delete({ where: { id } });
    if (brand.logoKey) await this.spaces.delete(brand.logoKey).catch(() => undefined);
    this.storeExport.scheduleExport();
    return { message: 'Marca eliminada' };
  }

  /** Sube (o reemplaza) el logo de la marca. */
  async uploadLogo(id: string, dataUri: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');

    const raw = dataUriToBuffer(dataUri);
    const { image } = await processLogoImage(raw);

    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const prefix = (process.env.STORE_SNAPSHOT_PREFIX || 'store').replace(/\/+$/, '');
    const key = `${prefix}/brands/${id}/${stamp}-${rand}.webp`;
    await this.spaces.uploadPublic(key, image, 'image/webp');

    const oldKey = brand.logoKey;
    const updated = await this.prisma.brand.update({ where: { id }, data: { logoKey: key } });
    if (oldKey && oldKey !== key) await this.spaces.delete(oldKey).catch(() => undefined);

    this.storeExport.scheduleExport();
    return this.withLogoUrl(updated);
  }

  /** Quita el logo de la marca (vuelve al recuadro con el nombre). */
  async removeLogo(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    if (brand.logoKey) await this.spaces.delete(brand.logoKey).catch(() => undefined);
    const updated = await this.prisma.brand.update({ where: { id }, data: { logoKey: null } });
    this.storeExport.scheduleExport();
    return this.withLogoUrl(updated);
  }

  private async ensureExists(id: string) {
    const brand = await this.prisma.brand.findUnique({ where: { id } });
    if (!brand) throw new NotFoundException('Marca no encontrada');
    return brand;
  }

  /** Resuelve la key de Spaces a URL de CDN para la UI. */
  private withLogoUrl<T extends { logoKey: string | null }>(brand: T): T & { logoUrl: string | null } {
    return { ...brand, logoUrl: brand.logoKey ? this.spaces.cdnUrl(brand.logoKey) : null };
  }
}
