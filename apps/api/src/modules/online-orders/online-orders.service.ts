import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, OnlineOrderStatus } from '@prisma/client';
import { UpdateOnlineOrderDto } from './dto/update-online-order.dto';

// Factura "cobrada" (se puede entregar el pedido). Una devolución parcial ya pasó por caja.
const PAID_INVOICE: InvoiceStatus[] = ['PAID', 'PARTIAL_RETURN'];

@Injectable()
export class OnlineOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(status?: string) {
    const where =
      status && Object.values(OnlineOrderStatus).includes(status as OnlineOrderStatus)
        ? { status: status as OnlineOrderStatus }
        : undefined;
    return this.prisma.onlineOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  // Contador del menú + los pendientes más recientes: el navegador compara sus ids con los
  // que ya avisó para sonar y mostrar la notificación solo con los pedidos NUEVOS.
  async pendingCount() {
    const where = { status: 'POR_VERIFICAR' as const };
    const [count, latest] = await Promise.all([
      this.prisma.onlineOrder.count({ where }),
      this.prisma.onlineOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, number: true, customerName: true, totalUsd: true, createdAt: true },
      }),
    ]);
    return { count, latest };
  }

  async findOne(id: string) {
    const order = await this.prisma.onlineOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  // Detalle para la pantalla: + la factura (número y si ya se cobró) y quién lo entregó.
  // OnlineOrder.invoiceId / deliveredById no tienen relación Prisma: se resuelven aparte.
  async findDetail(id: string) {
    const order = await this.findOne(id);
    const [invoice, deliveredBy] = await Promise.all([
      order.invoiceId
        ? this.prisma.invoice.findUnique({ where: { id: order.invoiceId }, select: { id: true, number: true, status: true } })
        : null,
      order.deliveredById
        ? this.prisma.user.findUnique({ where: { id: order.deliveredById }, select: { name: true } })
        : null,
    ]);
    return { ...order, invoice, deliveredByName: deliveredBy?.name ?? null };
  }

  // FACTURADO -> ENTREGADO, solo con la factura ya cobrada (no entregar mercancía sin cobrar).
  async deliver(id: string, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== 'FACTURADO' || !order.invoiceId) {
      throw new BadRequestException('Solo se puede entregar un pedido facturado');
    }
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: order.invoiceId },
      select: { number: true, status: true },
    });
    if (!invoice || !PAID_INVOICE.includes(invoice.status)) {
      throw new BadRequestException(
        `La factura${invoice?.number ? ` ${invoice.number}` : ''} aún no está cobrada: cóbrala en el POS antes de entregar el pedido`,
      );
    }
    await this.prisma.onlineOrder.update({
      where: { id },
      data: { status: 'ENTREGADO', deliveredAt: new Date(), deliveredById: userId },
    });
    return this.findDetail(id);
  }

  async update(id: string, dto: UpdateOnlineOrderDto) {
    const order = await this.findOne(id);
    if (order.status === 'FACTURADO' || order.status === 'ENTREGADO' || order.status === 'CANCELADO') {
      throw new BadRequestException('El pedido ya no se puede editar');
    }
    return this.prisma.onlineOrder.update({
      where: { id },
      data: {
        paymentRef: dto.paymentRef?.trim() || null,
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
      include: { items: true },
    });
  }

  async confirm(id: string, userId: string) {
    const order = await this.findOne(id);
    if (order.status !== 'POR_VERIFICAR') {
      throw new BadRequestException('El pedido no está por verificar');
    }
    return this.prisma.onlineOrder.update({
      where: { id },
      data: { status: 'CONFIRMADO', verifiedById: userId, verifiedAt: new Date() },
      include: { items: true },
    });
  }

  async cancel(id: string) {
    const order = await this.findOne(id);
    if (order.status === 'FACTURADO' || order.status === 'ENTREGADO') {
      throw new BadRequestException(`No se puede cancelar un pedido ${order.status === 'ENTREGADO' ? 'entregado' : 'facturado'}`);
    }
    return this.prisma.onlineOrder.update({
      where: { id },
      data: { status: 'CANCELADO' },
      include: { items: true },
    });
  }
}
