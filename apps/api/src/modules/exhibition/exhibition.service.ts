import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { PlaceItemDto } from './dto/place-item.dto';
import { RemoveItemDto } from './dto/remove-item.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

@Injectable()
export class ExhibitionService {
  constructor(private readonly prisma: PrismaService) {}

  // Lista productos con su estado de exhibicion + filtros (reusa el patron de products)
  async findProducts(query: QueryProductsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.brandId) where.brandId = query.brandId;
    if (query.exhibited !== undefined) where.isExhibited = query.exhibited;
    if (query.location) {
      where.exhibitionLocation = { contains: query.location, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          barcode: true,
          isExhibited: true,
          exhibitedSince: true,
          exhibitionLocation: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
        orderBy: [{ isExhibited: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const now = Date.now();
    const data = rows.map((p) => ({
      ...p,
      daysExhibited: p.exhibitedSince
        ? Math.floor((now - new Date(p.exhibitedSince).getTime()) / 86400000)
        : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Poner en exhibicion
  async place(dto: PlaceItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (product.isExhibited) throw new BadRequestException('El producto ya esta en exhibicion');

    const location = dto.location?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: { isExhibited: true, exhibitedSince: new Date(), exhibitionLocation: location },
      });
      return tx.exhibitionEntry.create({
        data: { productId: dto.productId, action: 'PLACED', location, createdById: userId },
      });
    });
  }

  // Retirar de exhibicion
  async remove(dto: RemoveItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.isExhibited) throw new BadRequestException('El producto no esta en exhibicion');

    const prevLocation = product.exhibitionLocation;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: { isExhibited: false, exhibitedSince: null, exhibitionLocation: null },
      });
      return tx.exhibitionEntry.create({
        data: {
          productId: dto.productId,
          action: 'REMOVED',
          location: prevLocation,
          reason: dto.reason ?? null,
          note: dto.note?.trim() || null,
          createdById: userId,
        },
      });
    });
  }

  // Historial completo de un producto
  async history(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, code: true, name: true, isExhibited: true, exhibitionLocation: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const entries = await this.prisma.exhibitionEntry.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    return { product, entries };
  }

  // Construye el rango de fechas Caracas para createdAt (timestamp)
  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = caracasDayStart(from);
    if (to) range.lte = caracasDayEnd(to);
    return range;
  }

  // Reporte: toda la actividad (puestas + retiros) del rango
  async activity(query: QueryActivityDto) {
    const where: Prisma.ExhibitionEntryWhereInput = {};
    const range = this.dateRange(query.from, query.to);
    if (range) where.createdAt = range;
    if (query.action) where.action = query.action;
    const productFilter: Prisma.ProductWhereInput = {};
    if (query.categoryId) productFilter.categoryId = query.categoryId;
    if (query.brandId) productFilter.brandId = query.brandId;
    if (Object.keys(productFilter).length > 0) where.product = productFilter;

    return this.prisma.exhibitionEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            category: { select: { name: true } },
            brand: { select: { name: true } },
          },
        },
      },
    });
  }

  // KPIs del rango
  async summary(query: QueryActivityDto) {
    const range = this.dateRange(query.from, query.to);
    const rangeWhere: Prisma.ExhibitionEntryWhereInput = range ? { createdAt: range } : {};

    const [currentlyExhibited, placedCount, removedCount, exhibitedProducts, topRaw] =
      await Promise.all([
        this.prisma.product.count({ where: { isExhibited: true, isActive: true } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'PLACED' } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'REMOVED' } }),
        this.prisma.product.findMany({
          where: { isExhibited: true, isActive: true },
          select: { exhibitedSince: true },
        }),
        this.prisma.exhibitionEntry.groupBy({
          by: ['productId'],
          where: { ...rangeWhere, action: 'PLACED' },
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: 5,
        }),
      ]);

    // Tiempo promedio en exhibicion (dias) de los actualmente exhibidos
    const now = Date.now();
    const days = exhibitedProducts
      .filter((p) => p.exhibitedSince)
      .map((p) => (now - new Date(p.exhibitedSince as Date).getTime()) / 86400000);
    const avgDaysExhibited =
      days.length > 0
        ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
        : 0;

    // Nombres de los top
    const topIds = topRaw.map((t) => t.productId);
    const topProducts = topIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: topIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const top = topRaw.map((t) => ({
      product: topProducts.find((p) => p.id === t.productId) || null,
      placedCount: t._count.productId,
    }));

    return { currentlyExhibited, placedCount, removedCount, avgDaysExhibited, top };
  }
}
