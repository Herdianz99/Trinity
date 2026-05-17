import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class PaymentSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ LIST ============

  async findAll(filters: {
    status?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { number: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 25;

    const [data, total] = await Promise.all([
      this.prisma.paymentSchedule.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paymentSchedule.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ============ DETAIL ============

  async findOne(id: string) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            payable: {
              select: {
                id: true,
                dueDate: true,
                status: true,
                netPayableUsd: true,
                netPayableBs: true,
                paidAmountUsd: true,
                paidAmountBs: true,
                purchaseOrder: { select: { id: true, number: true } },
              },
            },
            creditDebitNote: {
              select: {
                id: true,
                number: true,
                type: true,
                totalUsd: true,
                totalBs: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!schedule) throw new NotFoundException('Programación no encontrada');

    // Group items by supplier
    const supplierGroups: Record<string, {
      supplierName: string;
      totalUsd: number;
      totalBs: number;
      items: typeof schedule.items;
    }> = {};

    for (const item of schedule.items) {
      if (!supplierGroups[item.supplierName]) {
        supplierGroups[item.supplierName] = {
          supplierName: item.supplierName,
          totalUsd: 0,
          totalBs: 0,
          items: [],
        };
      }
      supplierGroups[item.supplierName].totalUsd += item.plannedAmountUsd;
      supplierGroups[item.supplierName].totalBs += item.plannedAmountBs;
      supplierGroups[item.supplierName].items.push(item);
    }

    const groupedBySupplier = Object.values(supplierGroups).map((g) => ({
      ...g,
      totalUsd: Math.round(g.totalUsd * 100) / 100,
      totalBs: Math.round(g.totalBs * 100) / 100,
    }));

    return { ...schedule, groupedBySupplier };
  }

  // ============ CREATE ============

  async create(dto: CreateScheduleDto, userId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });

    if (!rate) {
      throw new BadRequestException('No hay tasa de cambio registrada para hoy. Registre la tasa antes de crear programaciones.');
    }

    // Calculate budget in both currencies
    let budgetUsd = dto.budgetUsd || null;
    let budgetBs = dto.budgetBs || null;
    const budgetCurrency = dto.budgetCurrency || null;

    if (budgetCurrency === 'USD' && budgetUsd) {
      budgetBs = Math.round(budgetUsd * rate.rate * 100) / 100;
    } else if (budgetCurrency === 'Bs' && budgetBs) {
      budgetUsd = Math.round((budgetBs / rate.rate) * 100) / 100;
    }

    const schedule = await this.prisma.$transaction(async (tx) => {
      // Generate number PSC-XXXX
      const result = await tx.$queryRaw<{ max_num: string | null }[]>`
        SELECT MAX("number") as max_num FROM "PaymentSchedule"
      `;
      let nextNumber = 1;
      if (result[0]?.max_num) {
        const match = result[0].max_num.match(/PSC-(\d+)/);
        if (match) nextNumber = parseInt(match[1]) + 1;
      }
      const number = `PSC-${nextNumber.toString().padStart(4, '0')}`;

      return tx.paymentSchedule.create({
        data: {
          number,
          title: dto.title,
          status: 'DRAFT',
          budgetUsd,
          budgetBs,
          budgetCurrency,
          exchangeRate: rate.rate,
          notes: dto.notes,
          createdById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      });
    });

    return schedule;
  }

  // ============ ADD ITEM ============

  async addItem(scheduleId: string, dto: AddItemDto) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Programación no encontrada');
    if (schedule.status !== 'DRAFT' && schedule.status !== 'APPROVED') {
      throw new BadRequestException('Solo se pueden agregar documentos a programaciones en BORRADOR o APROBADO');
    }

    if (!dto.payableId && !dto.creditDebitNoteId) {
      throw new BadRequestException('Debe proporcionar payableId o creditDebitNoteId');
    }

    let supplierName = '';
    let description = '';
    let totalAmountUsd = 0;
    let totalAmountBs = 0;
    let balanceUsd = 0;

    if (dto.payableId) {
      const payable = await this.prisma.payable.findUnique({
        where: { id: dto.payableId },
        include: {
          supplier: { select: { name: true } },
          purchaseOrder: { select: { number: true } },
        },
      });
      if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
      if (payable.status !== 'PENDING' && payable.status !== 'PARTIAL') {
        throw new BadRequestException('La cuenta por pagar debe estar PENDIENTE o PARCIAL');
      }

      supplierName = payable.supplier.name;
      description = payable.purchaseOrder?.number || `CxP ${payable.id.slice(-6)}`;
      totalAmountUsd = payable.netPayableUsd;
      totalAmountBs = payable.netPayableBs;
      balanceUsd = Math.round((payable.netPayableUsd - payable.paidAmountUsd) * 100) / 100;

      // Check if already in this schedule
      const existing = await this.prisma.paymentScheduleItem.findFirst({
        where: { scheduleId, payableId: dto.payableId },
      });
      if (existing) throw new BadRequestException('Este documento ya está en la programación');
    }

    if (dto.creditDebitNoteId) {
      const note = await this.prisma.creditDebitNote.findUnique({
        where: { id: dto.creditDebitNoteId },
        include: {
          purchaseOrder: {
            include: { supplier: { select: { name: true } } },
          },
          invoice: {
            include: { customer: { select: { name: true } } },
          },
        },
      });
      if (!note) throw new NotFoundException('Nota de crédito/débito no encontrada');
      if (note.status !== 'POSTED') {
        throw new BadRequestException('La nota debe estar PUBLICADA');
      }
      if (note.appliedAt) {
        throw new BadRequestException('La nota ya fue aplicada');
      }

      // NDC (purchase) — supplier owes us
      supplierName = note.purchaseOrder?.supplier?.name || note.invoice?.customer?.name || 'Sin proveedor';
      description = note.number;
      totalAmountUsd = note.totalUsd;
      totalAmountBs = note.totalBs;
      balanceUsd = note.totalUsd;

      // Check if already in this schedule
      const existing = await this.prisma.paymentScheduleItem.findFirst({
        where: { scheduleId, creditDebitNoteId: dto.creditDebitNoteId },
      });
      if (existing) throw new BadRequestException('Esta nota ya está en la programación');
    }

    if (dto.plannedAmountUsd > balanceUsd) {
      throw new BadRequestException(
        `El monto planificado ($${dto.plannedAmountUsd}) excede el saldo pendiente ($${balanceUsd})`,
      );
    }

    const plannedAmountBs = Math.round(dto.plannedAmountUsd * schedule.exchangeRate * 100) / 100;

    const item = await this.prisma.paymentScheduleItem.create({
      data: {
        scheduleId,
        payableId: dto.payableId || null,
        creditDebitNoteId: dto.creditDebitNoteId || null,
        supplierName,
        description,
        totalAmountUsd,
        totalAmountBs,
        plannedAmountUsd: dto.plannedAmountUsd,
        plannedAmountBs,
      },
    });

    // Recalculate totals
    await this.recalculateTotals(scheduleId);

    return item;
  }

  // ============ DELETE ITEM ============

  async removeItem(scheduleId: string, itemId: string) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Programación no encontrada');
    if (schedule.status !== 'DRAFT' && schedule.status !== 'APPROVED') {
      throw new BadRequestException('Solo se pueden eliminar documentos de programaciones en BORRADOR o APROBADO');
    }

    const item = await this.prisma.paymentScheduleItem.findFirst({
      where: { id: itemId, scheduleId },
    });
    if (!item) throw new NotFoundException('Item no encontrado');

    await this.prisma.paymentScheduleItem.delete({ where: { id: itemId } });
    await this.recalculateTotals(scheduleId);

    return { deleted: true };
  }

  // ============ UPDATE ITEM ============

  async updateItem(scheduleId: string, itemId: string, dto: UpdateItemDto) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Programación no encontrada');
    if (schedule.status !== 'DRAFT' && schedule.status !== 'APPROVED') {
      throw new BadRequestException('Solo se pueden editar documentos de programaciones en BORRADOR o APROBADO');
    }

    const item = await this.prisma.paymentScheduleItem.findFirst({
      where: { id: itemId, scheduleId },
    });
    if (!item) throw new NotFoundException('Item no encontrado');

    // Validate against balance
    let balanceUsd = 0;
    if (item.payableId) {
      const payable = await this.prisma.payable.findUnique({ where: { id: item.payableId } });
      if (payable) {
        balanceUsd = Math.round((payable.netPayableUsd - payable.paidAmountUsd) * 100) / 100;
      }
    } else if (item.creditDebitNoteId) {
      const note = await this.prisma.creditDebitNote.findUnique({ where: { id: item.creditDebitNoteId } });
      if (note) balanceUsd = note.totalUsd;
    }

    if (dto.plannedAmountUsd > balanceUsd) {
      throw new BadRequestException(
        `El monto planificado ($${dto.plannedAmountUsd}) excede el saldo pendiente ($${balanceUsd})`,
      );
    }

    const plannedAmountBs = Math.round(dto.plannedAmountUsd * schedule.exchangeRate * 100) / 100;

    await this.prisma.paymentScheduleItem.update({
      where: { id: itemId },
      data: {
        plannedAmountUsd: dto.plannedAmountUsd,
        plannedAmountBs,
      },
    });

    await this.recalculateTotals(scheduleId);

    return this.prisma.paymentScheduleItem.findUnique({ where: { id: itemId } });
  }

  // ============ UPDATE STATUS ============

  async updateStatus(
    scheduleId: string,
    newStatus: string,
    user: { id: string; role: UserRole },
  ) {
    const schedule = await this.prisma.paymentSchedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('Programación no encontrada');

    const validTransitions: Record<string, string[]> = {
      DRAFT: ['APPROVED', 'CANCELLED'],
      APPROVED: ['EXECUTED', 'CANCELLED'],
      EXECUTED: [],
      CANCELLED: [],
    };

    if (!validTransitions[schedule.status]?.includes(newStatus)) {
      throw new BadRequestException(
        `No se puede cambiar de ${schedule.status} a ${newStatus}`,
      );
    }

    // Only ADMIN/SUPERVISOR can approve or execute
    if ((newStatus === 'APPROVED' || newStatus === 'EXECUTED') &&
        user.role !== UserRole.ADMIN && user.role !== UserRole.SUPERVISOR) {
      throw new ForbiddenException('Solo ADMIN o SUPERVISOR puede aprobar o ejecutar programaciones');
    }

    return this.prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: { status: newStatus as any },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ============ PENDING PAYABLES ============

  async getPendingPayables(filters: {
    supplierId?: string;
    dueBefore?: string;
    search?: string;
  }) {
    // 1. CxP with status PENDING or PARTIAL
    const payableWhere: any = {
      status: { in: ['PENDING', 'PARTIAL'] },
    };
    if (filters.supplierId) payableWhere.supplierId = filters.supplierId;
    if (filters.dueBefore) {
      const dueDate = new Date(filters.dueBefore);
      dueDate.setUTCHours(23, 59, 59, 999);
      payableWhere.dueDate = { lte: dueDate };
    }

    const payables = await this.prisma.payable.findMany({
      where: payableWhere,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, number: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const payableResults = payables.map((p) => ({
      id: p.id,
      type: 'CXP' as const,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      reference: p.purchaseOrder?.number || `CxP ${p.id.slice(-6)}`,
      totalAmountUsd: p.netPayableUsd,
      totalAmountBs: p.netPayableBs,
      paidAmountUsd: p.paidAmountUsd,
      balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
      balanceBs: Math.round((p.netPayableBs - p.paidAmountBs) * 100) / 100,
      dueDate: p.dueDate,
    }));

    // 2. NDC (purchase credit notes) with status POSTED and no appliedAt
    const noteWhere: any = {
      type: { in: ['NDC', 'NCC'] },
      status: 'POSTED',
      appliedAt: null,
    };

    const notes = await this.prisma.creditDebitNote.findMany({
      where: noteWhere,
      include: {
        purchaseOrder: {
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const noteResults = notes
      .filter((n) => {
        if (filters.supplierId && n.purchaseOrder?.supplierId !== filters.supplierId) return false;
        return true;
      })
      .map((n) => ({
        id: n.id,
        type: 'NDC' as const,
        supplierId: n.purchaseOrder?.supplierId || null,
        supplierName: n.purchaseOrder?.supplier?.name || 'Sin proveedor',
        reference: n.number,
        totalAmountUsd: n.totalUsd,
        totalAmountBs: n.totalBs,
        paidAmountUsd: 0,
        balanceUsd: n.totalUsd,
        balanceBs: n.totalBs,
        dueDate: n.createdAt,
      }));

    let results = [...payableResults, ...noteResults];

    // Filter by search
    if (filters.search) {
      const s = filters.search.toLowerCase();
      results = results.filter(
        (r) =>
          r.supplierName.toLowerCase().includes(s) ||
          r.reference.toLowerCase().includes(s),
      );
    }

    // Sort by dueDate ASC (most urgent first)
    results.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    return results;
  }

  // ============ HELPERS ============

  private async recalculateTotals(scheduleId: string) {
    const items = await this.prisma.paymentScheduleItem.findMany({
      where: { scheduleId },
    });

    let totalUsd = 0;
    let totalBs = 0;
    for (const item of items) {
      totalUsd += item.plannedAmountUsd;
      totalBs += item.plannedAmountBs;
    }

    await this.prisma.paymentSchedule.update({
      where: { id: scheduleId },
      data: {
        totalUsd: Math.round(totalUsd * 100) / 100,
        totalBs: Math.round(totalBs * 100) / 100,
      },
    });
  }
}
