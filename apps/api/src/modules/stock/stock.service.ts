import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { UserRole, Prisma } from '@prisma/client';
import { caracasDateKey } from '../../common/timezone';

type BregaFilter = 'all' | 'yes' | 'no';

interface StockPageParams {
  page?: number;
  limit?: number;
  search?: string;
  brega?: BregaFilter;
  warehouseId?: string;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    warehouseId?: string;
    productId?: string;
    lowStock?: boolean;
  }) {
    const where: any = {};

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (filters.productId) {
      where.productId = filters.productId;
    }

    const stocks = await this.prisma.stock.findMany({
      where,
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (filters.lowStock) {
      return stocks.filter((s) => s.quantity <= s.product.minStock);
    }

    return stocks;
  }

  async getGlobalStock() {
    const stocks = await this.prisma.stock.findMany({
      include: {
        product: true,
      },
    });

    const globalMap = new Map<
      string,
      { product: any; totalStock: number; minStock: number }
    >();

    for (const stock of stocks) {
      const existing = globalMap.get(stock.productId);
      if (existing) {
        existing.totalStock += stock.quantity;
      } else {
        globalMap.set(stock.productId, {
          product: stock.product,
          totalStock: stock.quantity,
          minStock: stock.product.minStock,
        });
      }
    }

    return Array.from(globalMap.values());
  }

  // --- Versiones paginadas (para la pantalla de Stock con ~10k productos) ---
  // Antes /stock/global traia TODAS las filas con el producto completo y el front las
  // pintaba de golpe -> la pestana se congelaba. Ahora se pagina server-side (50/pag)
  // con busqueda por codigo/nombre, y la valorizacion total se calcula con SUM en SQL
  // (ver getValuationSummary), sin traer todas las filas.

  private bregaCond(brega: BregaFilter | undefined): Prisma.Sql {
    if (brega === 'yes') return Prisma.sql`AND p."bregaApplies" = true`;
    if (brega === 'no') return Prisma.sql`AND p."bregaApplies" = false`;
    return Prisma.empty;
  }

  // Stock global agregado por producto (suma de todos los almacenes), paginado.
  async getGlobalStockPaged(params: StockPageParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const offset = (page - 1) * limit;
    const search = (params.search || '').trim();
    const searchCond = search
      ? Prisma.sql`AND (p."code" ILIKE ${'%' + search + '%'} OR p."name" ILIKE ${'%' + search + '%'})`
      : Prisma.empty;
    const bregaCond = this.bregaCond(params.brega);

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT p.id, p.code, p.name, p."costUsd", p."minStock", p."bregaApplies",
             c.name AS "categoryName",
             COALESCE(SUM(s.quantity), 0)::float8 AS "totalStock"
      FROM "Product" p
      JOIN "Stock" s ON s."productId" = p.id
      LEFT JOIN "Category" c ON c.id = p."categoryId"
      WHERE 1=1 ${searchCond} ${bregaCond}
      GROUP BY p.id, c.name
      ORDER BY p.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const totalRes = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT p.id) AS count
      FROM "Product" p
      JOIN "Stock" s ON s."productId" = p.id
      WHERE 1=1 ${searchCond} ${bregaCond}
    `);
    const total = Number(totalRes[0]?.count ?? 0);

    const items = rows.map((r) => ({
      product: {
        id: r.id,
        code: r.code,
        name: r.name,
        costUsd: r.costUsd,
        minStock: r.minStock,
        bregaApplies: r.bregaApplies,
        category: r.categoryName ? { name: r.categoryName } : null,
      },
      totalStock: Number(r.totalStock),
      minStock: r.minStock,
    }));

    return { items, total, page, limit };
  }

  // Stock de un almacen especifico, paginado.
  async getStockByWarehousePaged(params: StockPageParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
    const search = (params.search || '').trim();

    const productWhere: Prisma.ProductWhereInput = {};
    if (params.brega === 'yes') productWhere.bregaApplies = true;
    if (params.brega === 'no') productWhere.bregaApplies = false;
    if (search) {
      productWhere.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const where: Prisma.StockWhereInput = { warehouseId: params.warehouseId };
    if (Object.keys(productWhere).length) where.product = productWhere;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stock.findMany({
        where,
        select: {
          id: true,
          productId: true,
          warehouseId: true,
          quantity: true,
          product: {
            select: {
              id: true,
              code: true,
              name: true,
              costUsd: true,
              minStock: true,
              priceDetal: true,
              bregaApplies: true,
              category: { select: { name: true } },
            },
          },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { product: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stock.count({ where }),
    ]);

    return { items: rows, total, page, limit };
  }

  // Resumen valorizado de TODO el inventario (o de un almacen), respetando el filtro de
  // brecha pero NO la busqueda ni la paginacion. Se calcula con SUM en SQL para no traer
  // filas. Devuelve las bases para que el front aplique el % de brecha global (config).
  async getValuationSummary(params: { brega?: BregaFilter; warehouseId?: string }) {
    const bregaCond = this.bregaCond(params.brega);
    const whCond = params.warehouseId
      ? Prisma.sql`AND s."warehouseId" = ${params.warehouseId}`
      : Prisma.empty;

    const res = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT COUNT(DISTINCT p.id)::int AS products,
             COALESCE(SUM(s.quantity), 0)::float8 AS units,
             COALESCE(SUM(s.quantity * p."costUsd"), 0)::float8 AS "sumCostUsd",
             COALESCE(SUM(CASE WHEN p."bregaApplies" THEN s.quantity * p."costUsd" ELSE 0 END), 0)::float8 AS "sumCostBregaBase"
      FROM "Product" p
      JOIN "Stock" s ON s."productId" = p.id
      WHERE 1=1 ${bregaCond} ${whCond}
    `);

    const r = res[0] || {};
    return {
      products: Number(r.products ?? 0),
      units: Number(r.units ?? 0),
      sumCostUsd: Number(r.sumCostUsd ?? 0),
      sumCostBregaBase: Number(r.sumCostBregaBase ?? 0),
    };
  }

  // Conteo de productos con stock bajo (global), sin traer las filas.
  async getLowStockCount() {
    const res = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS count FROM (
        SELECT p.id
        FROM "Product" p
        JOIN "Stock" s ON s."productId" = p.id
        GROUP BY p.id, p."minStock"
        HAVING COALESCE(SUM(s.quantity), 0) <= p."minStock"
      ) x
    `);
    return { count: Number(res[0]?.count ?? 0) };
  }

  async getLowStock() {
    const globalStock = await this.getGlobalStock();
    return globalStock.filter((item) => item.totalStock <= item.minStock);
  }

  async getValuation() {
    const stocks = await this.prisma.stock.findMany({
      include: {
        product: true,
        warehouse: true,
      },
    });

    const today = caracasDateKey();
    const todayRate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    const exchangeRate = todayRate?.rate ?? 1;

    return stocks.map((stock) => {
      const costUsd = stock.product.costUsd ?? 0;
      const valuationUsd = stock.quantity * costUsd;
      const valuationLocal = valuationUsd * exchangeRate;

      return {
        productId: stock.productId,
        productName: stock.product.name,
        productCode: stock.product.code,
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        quantity: stock.quantity,
        costUsd,
        valuationUsd,
        valuationLocal,
        exchangeRate,
      };
    });
  }

  async adjust(dto: AdjustStockDto, user: { id: string; role: UserRole }) {
    if (dto.type === 'ADJUSTMENT_OUT') {
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERVISOR) {
        throw new ForbiddenException(
          'Solo SUPERVISOR o ADMIN pueden realizar ajustes de salida',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const quantityChange =
        dto.type === 'ADJUSTMENT_IN' ? dto.quantity : -dto.quantity;

      const stock = await tx.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        create: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.type === 'ADJUSTMENT_IN' ? dto.quantity : 0,
        },
        update: {
          quantity: { increment: quantityChange },
        },
      });

      if (stock.quantity < 0) {
        throw new BadRequestException('Stock insuficiente para el ajuste');
      }

      const movement = await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: dto.type,
          quantity: quantityChange,
          reason: dto.reason,
          createdById: user.id,
        },
      });

      return { stock, movement };
    });
  }
}
