import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnlineOrderStatus } from '@prisma/client';
import { UpdateOnlineOrderDto } from './dto/update-online-order.dto';

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

  async update(id: string, dto: UpdateOnlineOrderDto) {
    const order = await this.findOne(id);
    if (order.status === 'FACTURADO' || order.status === 'CANCELADO') {
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
    if (order.status === 'FACTURADO') {
      throw new BadRequestException('No se puede cancelar un pedido facturado');
    }
    return this.prisma.onlineOrder.update({
      where: { id },
      data: { status: 'CANCELADO' },
      include: { items: true },
    });
  }
}
