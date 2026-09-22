import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { productSearchTsQuery } from '../../common/product-search';
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
    if (query.exhibited === 'true') where.isExhibited = true;
    else if (query.exhibited === 'false') where.isExhibited = false;
    if (query.location) {
      where.exhibitionLocation = { contains: query.location, mode: 'insensitive' };
    }

    // Full-text search igual que /catalog/products: to_tsquery exige TODAS las palabras
    // en cualquier orden (prefijo palabra:*), con ILIKE de respaldo para codigos/refs.
    const search = query.search?.trim();
    if (search) {
      const tsq = productSearchTsQuery(search);
      const like = `%${search}%`;
      const searchResults = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "searchVector" @@ to_tsquery('spanish', ${tsq})
        OR code ILIKE ${like}
        OR barcode ILIKE ${like}
        OR "supplierRef" ILIKE ${like}
        OR "otherCode" ILIKE ${like}
      `;
      const ids = searchResults.map((r) => r.id);
      if (ids.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = { in: ids };
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
          exhibitedQuantity: true,
          exhibitedSince: true,
          exhibitionLocation: true,
          stock: { select: { quantity: true } },
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
    const data = rows.map(({ stock, ...p }) => ({
      ...p,
      // Existencia total (todos los depósitos) para mostrar y para topar la cantidad a exhibir.
      totalStock: stock.reduce((s, x) => s + x.quantity, 0),
      daysExhibited: p.exhibitedSince
        ? Math.floor((now - new Date(p.exhibitedSince).getTime()) / 86400000)
        : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Existencia total (todos los depositos) de un producto
  private async totalStock(productId: string): Promise<number> {
    const agg = await this.prisma.stock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  // Poner en exhibicion. La cantidad se SUMA a la ya exhibida; no puede superar la existencia.
  async place(dto: PlaceItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const qty = dto.quantity ?? 1;
    if (qty < 1) throw new BadRequestException('La cantidad debe ser al menos 1');

    const stock = await this.totalStock(dto.productId);
    const newQty = product.exhibitedQuantity + qty;
    if (newQty > stock) {
      throw new BadRequestException(
        `No hay suficiente existencia: exhibidas ${product.exhibitedQuantity}, existencia ${stock}`,
      );
    }

    const location = dto.location?.trim() || product.exhibitionLocation || null;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: {
          isExhibited: true,
          exhibitedQuantity: newQty,
          // El "desde" arranca solo si venia de 0; si ya estaba exhibido se conserva.
          exhibitedSince: product.isExhibited ? undefined : new Date(),
          exhibitionLocation: location,
        },
      });
      return tx.exhibitionEntry.create({
        data: { productId: dto.productId, action: 'PLACED', quantity: qty, location, createdById: userId },
      });
    });
  }

  // Retirar de exhibicion. Sin cantidad retira TODO; con cantidad es retiro parcial.
  async remove(dto: RemoveItemDto, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');
    if (!product.isExhibited || product.exhibitedQuantity <= 0) {
      throw new BadRequestException('El producto no esta en exhibicion');
    }

    const qty = Math.min(dto.quantity ?? product.exhibitedQuantity, product.exhibitedQuantity);
    if (qty < 1) throw new BadRequestException('La cantidad debe ser al menos 1');
    const newQty = product.exhibitedQuantity - qty;
    const prevLocation = product.exhibitionLocation;

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: dto.productId },
        data: {
          exhibitedQuantity: newQty,
          isExhibited: newQty > 0,
          exhibitedSince: newQty > 0 ? undefined : null,
          exhibitionLocation: newQty > 0 ? undefined : null,
        },
      });
      return tx.exhibitionEntry.create({
        data: {
          productId: dto.productId,
          action: 'REMOVED',
          quantity: qty,
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

    const [currentlyExhibited, placedCount, removedCount, autoRemovedCount, exhibitedProducts, topRaw] =
      await Promise.all([
        this.prisma.product.count({ where: { isExhibited: true, isActive: true } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'PLACED' } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'REMOVED' } }),
        this.prisma.exhibitionEntry.count({ where: { ...rangeWhere, action: 'REMOVED', isAutomatic: true } }),
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

    return { currentlyExhibited, placedCount, removedCount, autoRemovedCount, avgDaysExhibited, top };
  }
}
