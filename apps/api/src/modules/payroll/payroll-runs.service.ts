import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { computePayrollLine, PayrollParams } from './payroll-calc';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollLinesDto } from './dto/update-payroll-lines.dto';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Defaults del schema, por si el singleton de parámetros aún no existe.
const DEFAULT_PARAM = {
  ivssBs: 0, faovBs: 0, incesBs: 0,
  otDayFactor: 1.5, otNightFactor: 1.3, monthDays: 30, weeklyHours: 40,
};

const LINE_INCLUDE = {
  employee: {
    include: {
      customer: { select: { id: true, name: true, documentType: true, rif: true } },
      department: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PayrollRunLineInclude;

@Injectable()
export class PayrollRunsService {
  constructor(private prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const last = await this.prisma.payrollRun.findFirst({
      where: { number: { not: null } },
      orderBy: { number: 'desc' },
    });
    let next = 1;
    if (last?.number) {
      const m = last.number.match(/NOM-(\d+)/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return `NOM-${next.toString().padStart(4, '0')}`;
  }

  // Mapea los parámetros globales a los que espera el motor, según la frecuencia.
  private engineParams(type: string, p: typeof DEFAULT_PARAM): PayrollParams {
    const weekly = type === 'WEEKLY';
    return {
      ivssBs: p.ivssBs, faovBs: p.faovBs, incesBs: p.incesBs,
      otDayFactor: p.otDayFactor, otNightFactor: p.otNightFactor,
      monthDays: p.monthDays,
      periodHours: weekly ? p.weeklyHours : p.weeklyHours * 2,
      periodsPerYear: weekly ? 52 : 24,
    };
  }

  // Recalcula TODAS las líneas de la corrida con el motor + actualiza los totales.
  private async recompute(tx: Prisma.TransactionClient, runId: string) {
    const run = await tx.payrollRun.findUnique({ where: { id: runId }, include: { lines: true } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    const param = (await tx.payrollParam.findUnique({ where: { id: 'singleton' } })) ?? DEFAULT_PARAM;
    const eng = this.engineParams(run.type, param);

    let totalGross = 0, totalDed = 0, totalNet = 0;
    for (const line of run.lines) {
      const res = computePayrollLine({
        salaryBaseUsd: line.salaryBaseUsd,
        daysWorked: line.daysWorked,
        daysRest: line.daysRest,
        overtimeDayHours: line.overtimeDayHours,
        overtimeNightHours: line.overtimeNightHours,
        manualDeductionUsd: line.manualDeductionUsd,
        creditDeductionBs: line.creditDeductionBs,
        rate: run.exchangeRate,
      }, eng);
      await tx.payrollRunLine.update({
        where: { id: line.id },
        data: {
          salaryBs: res.salaryBs, overtimeBs: res.overtimeBs, grossBs: res.grossBs,
          ivssBs: res.ivssBs, faovBs: res.faovBs, totalDeductionsBs: res.totalDeductionsBs,
          netBs: res.netBs, netUsd: res.netUsd,
        },
      });
      totalGross += res.grossBs; totalDed += res.totalDeductionsBs; totalNet += res.netBs;
    }
    await tx.payrollRun.update({
      where: { id: runId },
      data: { totalGrossBs: r2(totalGross), totalDeductionsBs: r2(totalDed), totalNetBs: r2(totalNet) },
    });
  }

  async create(dto: CreatePayrollRunDto, userId: string) {
    // Tasa snapshot: la que venga o la de hoy.
    let rate = dto.exchangeRate;
    if (!rate) {
      const today = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
      if (!today) throw new BadRequestException('No hay tasa de cambio registrada para hoy; registre la tasa o indique una manual');
      rate = today.rate;
    }

    // Empleados activos de esa frecuencia → líneas iniciales (snapshot del sueldo base).
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true, frequency: dto.type },
      orderBy: { code: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException(`No hay empleados activos con frecuencia ${dto.type === 'WEEKLY' ? 'semanal' : 'quincenal'}`);
    }

    const number = await this.generateNumber();

    const runId = await this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          number,
          type: dto.type,
          periodFrom: new Date(dto.periodFrom),
          periodTo: new Date(dto.periodTo),
          exchangeRate: rate!,
          status: 'DRAFT',
          createdById: userId,
          lines: {
            create: employees.map((e) => ({
              employeeId: e.id,
              salaryBaseUsd: e.salaryBaseUsd,
            })),
          },
        },
      });
      await this.recompute(tx, run.id);
      return run.id;
    });

    return this.findOne(runId);
  }

  async findAll(query?: { status?: string; type?: string }) {
    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.type) where.type = query.type;
    return this.prisma.payrollRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
    });
  }

  async findOne(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        lines: { include: LINE_INCLUDE, orderBy: { employee: { code: 'asc' } } },
      },
    });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    return this.attachDebts(run);
  }

  // Adjunta a cada línea la deuda CxC pendiente del empleado (para decidir la deducción de crédito).
  private async attachDebts<T extends { lines: any[] }>(run: T): Promise<T> {
    const custIds = [...new Set(run.lines.map((l) => l.employee?.customerId).filter(Boolean))] as string[];
    const debt = new Map<string, number>();
    if (custIds.length > 0) {
      const recs = await this.prisma.receivable.findMany({
        where: { customerId: { in: custIds }, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        select: { customerId: true, amountUsd: true, paidAmountUsd: true },
      });
      for (const r of recs) {
        const bal = r.amountUsd - r.paidAmountUsd;
        if (bal > 0.001 && r.customerId) debt.set(r.customerId, (debt.get(r.customerId) || 0) + bal);
      }
    }
    for (const l of run.lines) {
      if (l.employee) (l.employee as any).customerDebtUsd = r2(debt.get(l.employee.customerId) || 0);
    }
    return run;
  }

  async updateLines(id: string, dto: UpdatePayrollLinesDto) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: { select: { id: true } } } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    if (run.status !== 'DRAFT') throw new BadRequestException('La corrida ya está cerrada; no se puede editar');

    const validIds = new Set(run.lines.map((l) => l.id));
    for (const l of dto.lines) {
      if (!validIds.has(l.id)) throw new BadRequestException(`La línea ${l.id} no pertenece a esta corrida`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const l of dto.lines) {
        await tx.payrollRunLine.update({
          where: { id: l.id },
          data: {
            ...(l.daysWorked !== undefined ? { daysWorked: l.daysWorked } : {}),
            ...(l.daysRest !== undefined ? { daysRest: l.daysRest } : {}),
            ...(l.overtimeDayHours !== undefined ? { overtimeDayHours: l.overtimeDayHours } : {}),
            ...(l.overtimeNightHours !== undefined ? { overtimeNightHours: l.overtimeNightHours } : {}),
            ...(l.manualDeductionUsd !== undefined ? { manualDeductionUsd: l.manualDeductionUsd } : {}),
            ...(l.creditDeductionBs !== undefined ? { creditDeductionBs: l.creditDeductionBs } : {}),
          },
        });
      }
      await this.recompute(tx, id);
    });

    return this.findOne(id);
  }

  // Agrega a la corrida los empleados activos de su frecuencia que aún no estén.
  async syncEmployees(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { lines: { select: { employeeId: true } } } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    if (run.status !== 'DRAFT') throw new BadRequestException('La corrida ya está cerrada');

    const present = new Set(run.lines.map((l) => l.employeeId));
    const employees = await this.prisma.employee.findMany({ where: { isActive: true, frequency: run.type } });
    const missing = employees.filter((e) => !present.has(e.id));
    if (missing.length === 0) return this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRunLine.createMany({
        data: missing.map((e) => ({ payrollRunId: id, employeeId: e.id, salaryBaseUsd: e.salaryBaseUsd })),
      });
      await this.recompute(tx, id);
    });
    return this.findOne(id);
  }

  async close(id: string, userId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    if (run.status !== 'DRAFT') throw new BadRequestException('La corrida ya está cerrada');

    await this.prisma.$transaction(async (tx) => {
      await this.recompute(tx, id); // asegura totales al día antes de cerrar

      // Aplicar las deducciones de crédito contra las CxC de cada empleado (FIFO).
      // Reusa el mecanismo de ReceivablePayment; no toca caja (según el alcance del módulo).
      const lines = await tx.payrollRunLine.findMany({
        where: { payrollRunId: id, creditDeductionBs: { gt: 0.001 } },
        include: { employee: { include: { customer: { select: { name: true } } } } },
      });
      for (const line of lines) {
        let remainingUsd = r2(line.creditDeductionBs / run.exchangeRate);
        const recs = await tx.receivable.findMany({
          where: { customerId: line.employee.customerId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        });
        for (const rec of recs) {
          if (remainingUsd <= 0.001) break;
          const bal = r2(rec.amountUsd - rec.paidAmountUsd);
          if (bal <= 0.001) continue;
          const applyUsd = Math.min(remainingUsd, bal);
          const applyBs = r2(applyUsd * run.exchangeRate);
          const newPaidUsd = r2(rec.paidAmountUsd + applyUsd);
          const isPaid = newPaidUsd >= rec.amountUsd - 0.01;
          await tx.receivablePayment.create({
            data: {
              receivableId: rec.id,
              amountUsd: applyUsd,
              amountBs: applyBs,
              exchangeRate: run.exchangeRate,
              methodId: null,
              reference: `Nomina ${run.number}`,
              notes: `Deduccion de nomina ${run.number}`,
              createdById: userId,
            },
          });
          await tx.receivable.update({
            where: { id: rec.id },
            data: {
              paidAmountUsd: newPaidUsd,
              paidAmountBs: r2(rec.paidAmountBs + applyBs),
              status: isPaid ? 'PAID' : 'PARTIAL',
              paidAt: isPaid ? new Date() : rec.paidAt,
            },
          });
          remainingUsd = r2(remainingUsd - applyUsd);
        }
        if (remainingUsd > 0.01) {
          throw new BadRequestException(
            `${line.employee.customer.name}: la deducción de crédito ($${r2(line.creditDeductionBs / run.exchangeRate).toFixed(2)}) supera su deuda pendiente por $${remainingUsd.toFixed(2)}. Ajuste el monto antes de cerrar.`,
          );
        }
      }

      await tx.payrollRun.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Corrida no encontrada');
    if (run.status !== 'DRAFT') throw new BadRequestException('Solo se pueden eliminar corridas en borrador');
    await this.prisma.payrollRun.delete({ where: { id } }); // las líneas caen por cascade
    return { ok: true };
  }
}
