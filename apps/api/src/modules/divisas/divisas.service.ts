import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const signed = (type: string, amt: number) => (type === 'ENTRADA' ? amt : -amt);

const MOVEMENT_INCLUDE = {
  company: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
};

@Injectable()
export class DivisasService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Catálogo: Empresas ───────────────────────────────────────────────────
  findCompanies(includeInactive = false) {
    return this.prisma.treasuryCompany.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCompany(dto: CreateCatalogDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.treasuryCompany.findUnique({ where: { name } });
    if (dup) throw new BadRequestException('Ya existe una empresa con ese nombre');
    return this.prisma.treasuryCompany.create({
      data: { name, isActive: dto.isActive ?? true },
    });
  }

  async updateCompany(id: string, dto: Partial<CreateCatalogDto>) {
    await this.getCompanyOrThrow(id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.treasuryCompany.update({ where: { id }, data });
  }

  private async getCompanyOrThrow(id: string) {
    const c = await this.prisma.treasuryCompany.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  // ── Catálogo: Bancos / Ubicaciones ───────────────────────────────────────
  findBanks(includeInactive = false) {
    return this.prisma.treasuryBank.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createBank(dto: CreateCatalogDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.treasuryBank.findUnique({ where: { name } });
    if (dup) throw new BadRequestException('Ya existe un banco/ubicación con ese nombre');
    return this.prisma.treasuryBank.create({
      data: { name, isActive: dto.isActive ?? true },
    });
  }

  async updateBank(id: string, dto: Partial<CreateCatalogDto>) {
    await this.getBankOrThrow(id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.treasuryBank.update({ where: { id }, data });
  }

  private async getBankOrThrow(id: string) {
    const b = await this.prisma.treasuryBank.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Banco/ubicación no encontrado');
    return b;
  }

  // ── Saldos (calculados) ──────────────────────────────────────────────────
  async summary() {
    const [companies, banks, movements] = await Promise.all([
      this.prisma.treasuryCompany.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryBank.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryMovement.findMany({
        select: { companyId: true, bankId: true, type: true, amountUsd: true },
      }),
    ]);

    const byCompany = new Map<string, { in: number; out: number }>();
    const byBank = new Map<string, { in: number; out: number }>();
    const bump = (m: Map<string, { in: number; out: number }>, key: string, type: string, amt: number) => {
      const e = m.get(key) || { in: 0, out: 0 };
      if (type === 'ENTRADA') e.in += amt;
      else e.out += amt;
      m.set(key, e);
    };
    for (const mv of movements) {
      bump(byCompany, mv.companyId, mv.type, mv.amountUsd);
      bump(byBank, mv.bankId, mv.type, mv.amountUsd);
    }

    const mapRow = (id: string, name: string, isActive: boolean, agg?: { in: number; out: number }) => {
      const inUsd = agg?.in || 0;
      const outUsd = agg?.out || 0;
      return {
        id,
        name,
        isActive,
        inUsd: round2(inUsd),
        outUsd: round2(outUsd),
        balanceUsd: round2(inUsd - outUsd),
      };
    };

    const companyRows = companies.map((c) => mapRow(c.id, c.name, c.isActive, byCompany.get(c.id)));
    const bankRows = banks.map((b) => mapRow(b.id, b.name, b.isActive, byBank.get(b.id)));
    const totalUsd = round2(companyRows.reduce((s, r) => s + r.balanceUsd, 0));

    return { companies: companyRows, banks: bankRows, totalUsd };
  }

  // ── Movimientos (ledger) ─────────────────────────────────────────────────
  /**
   * Devuelve los movimientos y, cuando la vista es de UNA sola dimensión
   * (una empresa O un banco, sin filtro de tipo), el saldo corriente acumulado
   * de esa dimensión tras cada fila. El saldo corriente se calcula sobre TODO
   * el historial de la dimensión (ordenado por fecha), luego se recorta al rango.
   */
  async findMovements(q: QueryMovementsDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const dimCompany = !!q.companyId && !q.bankId;
    const dimBank = !!q.bankId && !q.companyId;
    const withRunning = (dimCompany || dimBank) && !q.type;

    if (withRunning) {
      const dimWhere = dimCompany ? { companyId: q.companyId } : { bankId: q.bankId };
      const all = await this.prisma.treasuryMovement.findMany({
        where: dimWhere,
        include: MOVEMENT_INCLUDE,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      });
      let bal = 0;
      const withBal = all.map((m) => {
        bal += signed(m.type, m.amountUsd);
        return { ...m, runningBalanceUsd: round2(bal) };
      });
      let rows = withBal;
      if (from) rows = rows.filter((r) => r.date >= from);
      if (to) rows = rows.filter((r) => r.date <= to);
      rows = rows.slice().reverse(); // más recientes primero
      return { movements: rows, hasRunningBalance: true };
    }

    const where: any = {};
    if (q.companyId) where.companyId = q.companyId;
    if (q.bankId) where.bankId = q.bankId;
    if (q.type) where.type = q.type;
    if (from || to) where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const movements = await this.prisma.treasuryMovement.findMany({
      where,
      include: MOVEMENT_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return { movements, hasRunningBalance: false };
  }

  async createMovement(dto: CreateMovementDto, userId: string) {
    const [company, bank] = await Promise.all([
      this.prisma.treasuryCompany.findUnique({ where: { id: dto.companyId } }),
      this.prisma.treasuryBank.findUnique({ where: { id: dto.bankId } }),
    ]);
    if (!company) throw new BadRequestException('Empresa no válida');
    if (!bank) throw new BadRequestException('Banco/ubicación no válido');

    return this.prisma.treasuryMovement.create({
      data: {
        date: new Date(dto.date),
        companyId: dto.companyId,
        bankId: dto.bankId,
        type: dto.type,
        amountUsd: round2(dto.amountUsd),
        modalidad: dto.modalidad || null,
        counterparty: dto.counterparty?.trim() || null,
        reference: dto.reference?.trim() || null,
        description: dto.description?.trim() || null,
        status: dto.status || 'CONFIRMADO',
        createdById: userId,
      },
      include: MOVEMENT_INCLUDE,
    });
  }

  async updateMovement(id: string, dto: Partial<CreateMovementDto>) {
    const existing = await this.prisma.treasuryMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento no encontrado');
    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.companyId !== undefined) data.companyId = dto.companyId;
    if (dto.bankId !== undefined) data.bankId = dto.bankId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amountUsd !== undefined) data.amountUsd = round2(dto.amountUsd);
    if (dto.modalidad !== undefined) data.modalidad = dto.modalidad || null;
    if (dto.counterparty !== undefined) data.counterparty = dto.counterparty?.trim() || null;
    if (dto.reference !== undefined) data.reference = dto.reference?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.treasuryMovement.update({ where: { id }, data, include: MOVEMENT_INCLUDE });
  }

  async deleteMovement(id: string) {
    const existing = await this.prisma.treasuryMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento no encontrado');
    await this.prisma.treasuryMovement.delete({ where: { id } });
    return { ok: true };
  }
}
