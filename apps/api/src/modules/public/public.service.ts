import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async createOrder(dto: CreateOrderDto) {
    const codes = Array.from(new Set(dto.items.map((i) => i.code.trim()).filter(Boolean)));
    if (codes.length === 0) throw new BadRequestException('El pedido no tiene productos');

    const rateRow = await this.prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    const rate = rateRow?.rate ?? 0;

    const products = await this.prisma.product.findMany({
      where: { code: { in: codes }, isActive: true, showInStore: true },
      select: { code: true, name: true, priceDetal: true },
    });
    const byCode = new Map(products.map((p) => [p.code, p]));

    // Items con precios RECALCULADOS por Trinity (nunca confiar en el precio del cliente).
    const items = dto.items.map((i) => {
      const p = byCode.get(i.code.trim());
      if (!p) throw new BadRequestException(`Producto no disponible: ${i.code}`);
      const priceUsd = p.priceDetal;
      return {
        code: p.code,
        name: p.name,
        quantity: i.quantity,
        priceUsd,
        priceBs: Math.round(priceUsd * rate * 100) / 100,
      };
    });

    const totalUsd = Math.round(items.reduce((s, i) => s + i.priceUsd * i.quantity, 0) * 100) / 100;
    const totalBs = Math.round(totalUsd * rate * 100) / 100;

    return this.prisma.$transaction(async (tx) => {
      // Correlativo WEB-0001 con SELECT FOR UPDATE (regla de correlativos del proyecto).
      const res = await tx.$queryRaw<{ max: number | null }[]>`
        SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
          SELECT "number" FROM "OnlineOrder" WHERE "number" IS NOT NULL FOR UPDATE
        ) sub
      `;
      const next = (res[0]?.max || 0) + 1;
      const number = `WEB-${next.toString().padStart(4, '0')}`;

      const order = await tx.onlineOrder.create({
        data: {
          number,
          customerName: dto.customerName.trim(),
          phone: dto.phone.trim(),
          cedula: dto.cedula?.trim() || null,
          deliveryMethod: dto.deliveryMethod,
          address: dto.address?.trim() || null,
          paymentRef: dto.paymentRef?.trim() || null,
          notes: dto.notes?.trim() || null,
          email: dto.email?.trim() || null,
          totalUsd,
          totalBs,
          exchangeRate: rate,
          items: { create: items },
        },
      });
      return { number: order.number, totalUsd, totalBs };
    });
  }
}
