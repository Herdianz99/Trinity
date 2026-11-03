import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SpacesService } from '../product-images/spaces.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { caracasDateKey } from '../../common/timezone';

// La captura del pago se comprime en el navegador antes de subir; este tope es
// una red de seguridad para la superficie publica (sin auth).
const MAX_PROOF_BYTES = 4 * 1024 * 1024; // 4 MB
const PROOF_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

@Injectable()
export class PublicService {
  constructor(
    private prisma: PrismaService,
    private spaces: SpacesService,
  ) {}

  /** Decodifica un data URL base64 de imagen. Devuelve null si no viene captura. */
  private parseProof(dataUrl?: string): { buffer: Buffer; contentType: string; ext: string } | null {
    if (!dataUrl?.trim()) return null;
    const match = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/i.exec(dataUrl.trim());
    if (!match) throw new BadRequestException('Formato de captura invalido');
    const contentType = match[1].toLowerCase();
    const ext = PROOF_EXT[contentType];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) throw new BadRequestException('La captura esta vacia');
    if (buffer.length > MAX_PROOF_BYTES) throw new BadRequestException('La captura es demasiado grande');
    return { buffer, contentType, ext };
  }

  async createOrder(dto: CreateOrderDto) {
    const codes = Array.from(new Set(dto.items.map((i) => i.code.trim()).filter(Boolean)));
    if (codes.length === 0) throw new BadRequestException('El pedido no tiene productos');

    // Última tasa con fecha <= hoy (Caracas): el pedido se cobra a la tasa VIGENTE al
    // momento de comprar (lo que vio el cliente), no a la de mañana pre-cargada por el cron.
    const rateRow = await this.prisma.exchangeRate.findFirst({
      where: { date: { lte: caracasDateKey() } },
      orderBy: { date: 'desc' },
    });
    const rate = rateRow?.rate ?? 0;

    // Bloqueados para la venta no se aceptan (al facturar el pedido se omitirían).
    const products = await this.prisma.product.findMany({
      where: { code: { in: codes }, isActive: true, showInStore: true, saleBlocked: false },
      select: {
        id: true,
        code: true,
        name: true,
        priceDetal: true,
        stock: { where: { warehouse: { countsForSale: true } }, select: { quantity: true } },
      },
    });
    const byCode = new Map(products.map((p) => [p.code, p]));

    // Existencia libre = almacenes que cuentan para la venta - apartado en facturas en espera
    // (la misma regla con que el snapshot marca Disponible/Pocas/Agotado). Nunca se le dice al
    // cliente cuántas hay, solo que no alcanza (los números de stock no se publican).
    const reservedRows = await this.prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p) => p.id) }, invoice: { status: 'PENDING' } },
      _sum: { quantity: true },
    });
    const reserved = new Map(reservedRows.map((r) => [r.productId, Math.max(0, r._sum.quantity || 0)]));
    const wanted = new Map<string, number>();
    for (const i of dto.items) {
      const code = i.code.trim();
      wanted.set(code, (wanted.get(code) || 0) + i.quantity);
    }
    const short = products.filter((p) => {
      const free = p.stock.reduce((s, x) => s + x.quantity, 0) - (reserved.get(p.id) || 0);
      return (wanted.get(p.code) || 0) > free + 1e-9;
    });
    if (short.length) {
      const names = short.map((p) => `"${p.name}"`).join(', ');
      throw new BadRequestException({
        statusCode: 400,
        message:
          short.length === 1
            ? `No tenemos suficiente existencia de ${names} para la cantidad pedida. Reduce la cantidad o escríbenos por WhatsApp.`
            : `No tenemos suficiente existencia de: ${names}. Reduce las cantidades o escríbenos por WhatsApp.`,
        outOfStock: short.map((p) => p.code),
      });
    }

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

    // Sube la captura del pago a Spaces ANTES de la transaccion (no meter red dentro
    // de la tx). Clave con UUID -> URL no adivinable. Si la BD falla, se borra.
    const proof = this.parseProof(dto.paymentProof);
    let paymentProofUrl: string | null = null;
    let proofKey: string | null = null;
    if (proof) {
      proofKey = `orders/proof/${randomUUID()}.${proof.ext}`;
      paymentProofUrl = await this.spaces.uploadPublic(proofKey, proof.buffer, proof.contentType);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
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
            paymentProofUrl,
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
    } catch (err) {
      // Compensacion: si la BD fallo tras subir la captura, borra el objeto huerfano.
      if (proofKey) await this.spaces.delete(proofKey);
      throw err;
    }
  }
}
