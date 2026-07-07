import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from './spaces.service';
import { processProductImage, dataUriToBuffer } from './image-processing';

@Injectable()
export class ProductImagesService {
  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
  ) {}

  async list(productId: string) {
    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upload(productId: string, dataUri: string, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const raw = dataUriToBuffer(dataUri);
    const processed = await processProductImage(raw);

    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const baseKey = `products/${productId}/${stamp}-${rand}`;
    const thumbKey = `${baseKey}-thumb.webp`;
    const mediumKey = `${baseKey}-medium.webp`;

    const [thumbUrl, mediumUrl] = await Promise.all([
      this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
      this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
    ]);

    const existingCount = await this.prisma.productImage.count({ where: { productId } });
    const isPrimary = existingCount === 0;

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        thumbKey,
        mediumKey,
        isPrimary,
        sortOrder: existingCount,
        bytes: processed.bytes,
        width: processed.width,
        height: processed.height,
        createdById: userId,
      },
    });

    if (isPrimary) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { primaryImageThumbUrl: thumbUrl, primaryImageMediumUrl: mediumUrl },
      });
    }

    return { ...image, thumbUrl, mediumUrl };
  }

  async remove(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Imagen no encontrada');

    await Promise.all([this.spaces.delete(image.thumbKey), this.spaces.delete(image.mediumKey)]);
    await this.prisma.productImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await this.prisma.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
        await this.prisma.product.update({
          where: { id: productId },
          data: {
            primaryImageThumbUrl: this.spaces.cdnUrl(next.thumbKey),
            primaryImageMediumUrl: this.spaces.cdnUrl(next.mediumKey),
          },
        });
      } else {
        await this.prisma.product.update({
          where: { id: productId },
          data: { primaryImageThumbUrl: null, primaryImageMediumUrl: null },
        });
      }
    }

    return { message: 'Imagen eliminada' };
  }
}
