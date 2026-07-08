import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnlineOrderStatus } from '@prisma/client';

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

  async pendingCount() {
    const count = await this.prisma.onlineOrder.count({ where: { status: 'POR_VERIFICAR' } });
    return { count };
  }

  async findOne(id: string) {
    const order = await this.prisma.onlineOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
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
