import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { AckNotificationDto } from './dto/ack-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Expande el target a una lista de employeeIds (solo empleados activos). */
  private async resolveTargetEmployeeIds(target: CreateNotificationDto['target']): Promise<string[]> {
    if (target.mode === 'INDIVIDUAL' || target.mode === 'MULTIPLE') {
      const ids = (target.employeeIds ?? []).filter(Boolean);
      if (!ids.length) throw new BadRequestException('Debes elegir al menos un empleado');
      const found = await this.prisma.employee.findMany({
        where: { id: { in: ids }, isActive: true }, select: { id: true },
      });
      return found.map((e) => e.id);
    }
    if (target.mode === 'DEPARTMENT') {
      if (!target.departmentId) throw new BadRequestException('Falta el departamento');
      const found = await this.prisma.employee.findMany({
        where: { departmentId: target.departmentId, isActive: true }, select: { id: true },
      });
      return found.map((e) => e.id);
    }
    // ALL
    const found = await this.prisma.employee.findMany({ where: { isActive: true }, select: { id: true } });
    return found.map((e) => e.id);
  }

  async create(dto: CreateNotificationDto, userId: string) {
    const employeeIds = await this.resolveTargetEmployeeIds(dto.target);
    if (!employeeIds.length) throw new BadRequestException('No hay empleados destinatarios');
    return this.prisma.notification.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        type: dto.type,
        createdById: userId,
        recipients: { create: employeeIds.map((employeeId) => ({ employeeId })) },
      },
      include: { _count: { select: { recipients: true } } },
    });
  }

  /** Empleados y departamentos activos para componer una notificacion (para el emisor). */
  async targets() {
    const [employees, departments] = await Promise.all([
      this.prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, code: true, departmentId: true, customer: { select: { name: true } } },
        orderBy: { customer: { name: 'asc' } },
      }),
      this.prisma.department.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { employees, departments };
  }

  async listForSender(query: { type?: string }) {
    const rows = await this.prisma.notification.findMany({
      where: query.type ? { type: query.type as any } : {},
      select: {
        id: true, title: true, type: true, createdAt: true,
        createdBy: { select: { name: true } },
        recipients: { select: { ackState: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((n) => {
      const recibido = n.recipients.filter((r) => r.ackState === 'RECIBIDO').length;
      const rechazado = n.recipients.filter((r) => r.ackState === 'RECHAZADO').length;
      const pendiente = n.recipients.filter((r) => r.ackState === 'PENDIENTE').length;
      const { recipients, ...rest } = n;
      return { ...rest, total: n.recipients.length, recibido, rechazado, pendiente };
    });
  }

  async detailForSender(id: string) {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        recipients: {
          select: {
            id: true, ackState: true, comment: true, ackAt: true,
            employee: { select: { code: true, customer: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!n) throw new NotFoundException('Notificación no encontrada');
    return n;
  }

  private async employeeIdOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
    if (!user?.employeeId) throw new ForbiddenException('Tu usuario no está vinculado a un empleado.');
    return user.employeeId;
  }

  async inbox(userId: string, ackState?: string) {
    const employeeId = await this.employeeIdOf(userId);
    return this.prisma.notificationRecipient.findMany({
      where: { employeeId, ...(ackState ? { ackState: ackState as any } : {}) },
      select: {
        id: true, ackState: true, comment: true, ackAt: true,
        notification: {
          select: {
            id: true, title: true, body: true, type: true, createdAt: true,
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async ack(userId: string, recipientId: string, dto: AckNotificationDto) {
    const employeeId = await this.employeeIdOf(userId);
    const rec = await this.prisma.notificationRecipient.findUnique({ where: { id: recipientId } });
    if (!rec || rec.employeeId !== employeeId) throw new ForbiddenException('Notificación no disponible.');
    if (rec.ackState !== 'PENDIENTE') throw new BadRequestException('Esta notificación ya fue respondida.');
    return this.prisma.notificationRecipient.update({
      where: { id: recipientId },
      data: { ackState: dto.ackState, comment: dto.comment?.trim() || null, ackAt: new Date() },
    });
  }
}
