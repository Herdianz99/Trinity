import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollPdfService } from '../payroll/payroll-pdf.service';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

@Injectable()
export class MeService {
  constructor(
    private prisma: PrismaService,
    private payrollPdf: PayrollPdfService,
  ) {}

  /**
   * Resuelve el empleado (y su customer) del usuario logueado. Lanza 403 si el usuario
   * no tiene un empleado vinculado (no debe ver el portal).
   */
  private async resolveEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    if (!user?.employeeId) {
      throw new ForbiddenException('Tu usuario no está vinculado a un empleado.');
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { id: true, customerId: true },
    });
    if (!employee) throw new ForbiddenException('Empleado no encontrado.');
    return employee; // { id, customerId }
  }

  async getPerfil(userId: string) {
    const { id } = await this.resolveEmployee(userId);
    return this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true, code: true, bank: true, salaryBaseUsd: true, bonusUsd: true,
        frequency: true, isActive: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
        customer: {
          select: {
            name: true, documentType: true, rif: true, phone: true, email: true,
            address: true, creditLimit: true, creditDays: true, code: true,
          },
        },
      },
    });
  }

  async getCxc(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    const rows = await this.prisma.receivable.findMany({
      where: { customerId, status: { not: 'CANCELLED' } },
      select: {
        id: true, number: true, documentNumber: true, type: true,
        amountUsd: true, amountBs: true, paidAmountUsd: true, paidAmountBs: true,
        dueDate: true, originalDate: true, status: true, currency: true,
      },
      orderBy: [{ dueDate: 'asc' }, { originalDate: 'asc' }],
    });
    return rows.map((r) => ({ ...r, saldoUsd: r2(r.amountUsd - r.paidAmountUsd) }));
  }

  async getFacturas(userId: string) {
    const { customerId } = await this.resolveEmployee(userId);
    if (!customerId) return [];
    const rows = await this.prisma.invoice.findMany({
      where: { customerId },
      select: {
        id: true, number: true, fiscalNumber: true, status: true,
        totalUsd: true, totalBs: true, totalPaidUsd: true,
        isCredit: true, dueDate: true, createdAt: true, paidAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((i) => ({ ...i, saldoUsd: r2(i.totalUsd - i.totalPaidUsd) }));
  }

  async getRecibos(userId: string) {
    const { id: employeeId } = await this.resolveEmployee(userId);
    return this.prisma.payrollRunLine.findMany({
      where: { employeeId, payrollRun: { status: 'CLOSED' } },
      select: {
        id: true, grossBs: true, totalDeductionsBs: true, netBs: true, netUsd: true,
        creditDeductionBs: true,
        payrollRun: { select: { id: true, number: true, periodFrom: true, periodTo: true, type: true, exchangeRate: true } },
      },
      orderBy: { payrollRun: { periodTo: 'desc' } },
    });
  }

  async getAmonestaciones(userId: string) {
    const { id: employeeId } = await this.resolveEmployee(userId);
    return this.prisma.disciplinaryAction.findMany({
      where: { employeeId },
      select: {
        id: true, number: true, level: true, sequence: true, occurredAt: true, reason: true,
        faultType: { select: { name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async getResumen(userId: string) {
    const { id: employeeId, customerId } = await this.resolveEmployee(userId);
    const [cxc, facturasPend, notifPend] = await Promise.all([
      customerId
        ? this.prisma.receivable.aggregate({
            where: { customerId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
            _sum: { amountUsd: true, paidAmountUsd: true },
          })
        : Promise.resolve({ _sum: { amountUsd: 0, paidAmountUsd: 0 } } as any),
      customerId
        ? this.prisma.invoice.count({ where: { customerId, status: 'PENDING' } })
        : Promise.resolve(0),
      this.prisma.notificationRecipient.count({ where: { employeeId, ackState: 'PENDIENTE' } }),
    ]);
    const saldoCxcUsd = r2((cxc._sum.amountUsd || 0) - (cxc._sum.paidAmountUsd || 0));
    return { saldoCxcUsd, facturasPendientes: facturasPend, notificacionesPendientes: notifPend };
  }

  async getReciboPdf(userId: string, lineId: string, overtime: boolean): Promise<Buffer> {
    const { id: employeeId } = await this.resolveEmployee(userId);
    const line = await this.prisma.payrollRunLine.findUnique({
      where: { id: lineId },
      select: { id: true, employeeId: true, payrollRunId: true },
    });
    if (!line || line.employeeId !== employeeId) {
      throw new ForbiddenException('Recibo no disponible.');
    }
    return this.payrollPdf.generateReceipt(line.payrollRunId, lineId, overtime);
  }
}
