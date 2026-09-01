import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateBsLoadDto } from './dto/create-bs-load.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { CreateBsMovementDto } from './dto/create-bs-movement.dto';
import { QueryBsMovementsDto } from './dto/query-bs-movements.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const signed = (type: string, amt: number) => (type === 'ENTRADA' ? amt : -amt);

const MOVEMENT_INCLUDE = {
  company: { select: { id: true, name: true } },
  bank: { select: { id: true, name: true } },
  originBank: { select: { id: true, name: true } },
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

  // ── Catálogo: Bancos de ORIGEN (Bs) ──────────────────────────────────────
  findOriginBanks(includeInactive = false) {
    return this.prisma.treasuryOriginBank.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createOriginBank(dto: CreateCatalogDto) {
    const name = dto.name.trim();
    const dup = await this.prisma.treasuryOriginBank.findUnique({ where: { name } });
    if (dup) throw new BadRequestException('Ya existe un banco de origen con ese nombre');
    return this.prisma.treasuryOriginBank.create({ data: { name, isActive: dto.isActive ?? true } });
  }

  async updateOriginBank(id: string, dto: Partial<CreateCatalogDto>) {
    const b = await this.prisma.treasuryOriginBank.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Banco de origen no encontrado');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.treasuryOriginBank.update({ where: { id }, data });
  }

  // ── Cargas de Bs por empresa ─────────────────────────────────────────────
  async createBsLoad(dto: CreateBsLoadDto, userId: string) {
    const company = await this.prisma.treasuryCompany.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Empresa no válida');
    return this.prisma.treasuryBsLoad.create({
      data: {
        companyId: dto.companyId,
        amountBs: round2(dto.amountBs),
        date: dto.date ? new Date(dto.date) : new Date(),
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
  }

  findBsLoads(companyId: string) {
    return this.prisma.treasuryBsLoad.findMany({
      where: { companyId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async deleteBsLoad(id: string) {
    const existing = await this.prisma.treasuryBsLoad.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Carga de Bs no encontrada');
    await this.prisma.treasuryBsLoad.delete({ where: { id } });
    return { ok: true };
  }

  // ── Saldos (calculados) ──────────────────────────────────────────────────
  // USD: "Disponible" = movimientos CONFIRMADOS; "Tránsito" = PENDIENTES (no suman al
  // disponible). Bs: saldo por empresa = cargas − Bs gastados en movimientos.
  async summary() {
    const [companies, banks, movements, bsMovements] = await Promise.all([
      this.prisma.treasuryCompany.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryBank.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.treasuryMovement.findMany({
        select: { companyId: true, bankId: true, type: true, amountUsd: true, amountBs: true, status: true },
      }),
      this.prisma.treasuryBsMovement.findMany({
        select: { companyId: true, type: true, amountBs: true, status: true },
      }),
    ]);

    type Agg = { disp: number; trans: number };
    const byCompany = new Map<string, Agg>();
    const byBank = new Map<string, Agg>();
    const bsByCompany = new Map<string, number>(); // saldo Bs disponible (solo CONFIRMADO)
    const bump = (m: Map<string, Agg>, key: string, status: string, delta: number) => {
      const e = m.get(key) || { disp: 0, trans: 0 };
      if (status === 'PENDIENTE') e.trans += delta;
      else e.disp += delta;
      m.set(key, e);
    };
    const bumpBs = (companyId: string, delta: number) =>
      bsByCompany.set(companyId, (bsByCompany.get(companyId) || 0) + delta);

    for (const mv of movements) {
      const delta = signed(mv.type, mv.amountUsd);
      bump(byCompany, mv.companyId, mv.status, delta);
      bump(byBank, mv.bankId, mv.status, delta);
      // Bs: comprar divisas (ENTRADA) GASTA Bs; vender (SALIDA) RECIBE Bs. Solo CONFIRMADO.
      // signed(ENTRADA)=+amt => queremos -amt (salida); signed(SALIDA)=-amt => queremos +amt.
      if (mv.amountBs && mv.status !== 'PENDIENTE') bumpBs(mv.companyId, -signed(mv.type, mv.amountBs));
    }
    for (const bm of bsMovements) {
      if (bm.status !== 'PENDIENTE') bumpBs(bm.companyId, signed(bm.type, bm.amountBs));
    }

    const mapRow = (id: string, name: string, isActive: boolean, agg?: Agg) => {
      const disp = agg?.disp || 0;
      const trans = agg?.trans || 0;
      return {
        id,
        name,
        isActive,
        disponibleUsd: round2(disp),
        transitoUsd: round2(trans),
        balanceUsd: round2(disp), // legacy = disponible
      };
    };

    const companyRows = companies.map((c) => {
      const row = mapRow(c.id, c.name, c.isActive, byCompany.get(c.id));
      const bsBalance = round2(bsByCompany.get(c.id) || 0);
      return { ...row, bsBalance };
    });
    const bankRows = banks.map((b) => mapRow(b.id, b.name, b.isActive, byBank.get(b.id)));

    const totalDisponibleUsd = round2(companyRows.reduce((s, r) => s + r.disponibleUsd, 0));
    const totalTransitoUsd = round2(companyRows.reduce((s, r) => s + r.transitoUsd, 0));
    const totalBs = round2(companyRows.reduce((s, r) => s + r.bsBalance, 0));

    return {
      companies: companyRows,
      banks: bankRows,
      totalDisponibleUsd,
      totalTransitoUsd,
      totalBs,
      totalUsd: totalDisponibleUsd, // legacy
    };
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
      // El saldo corriente acumula solo los CONFIRMADOS (los PENDIENTES son "tránsito" y
      // no suman al disponible); las filas pendientes muestran el disponible sin cambio.
      let bal = 0;
      const withBal = all.map((m) => {
        if (m.status !== 'PENDIENTE') bal += signed(m.type, m.amountUsd);
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
    if (dto.originBankId) {
      const ob = await this.prisma.treasuryOriginBank.findUnique({ where: { id: dto.originBankId } });
      if (!ob) throw new BadRequestException('Banco de origen no válido');
    }

    return this.prisma.treasuryMovement.create({
      data: {
        date: new Date(dto.date),
        companyId: dto.companyId,
        bankId: dto.bankId,
        originBankId: dto.originBankId || null,
        type: dto.type,
        amountUsd: round2(dto.amountUsd),
        amountBs: dto.amountBs != null ? round2(dto.amountBs) : null,
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
    if (dto.originBankId !== undefined) data.originBankId = dto.originBankId || null;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amountUsd !== undefined) data.amountUsd = round2(dto.amountUsd);
    if (dto.amountBs !== undefined) data.amountBs = dto.amountBs != null ? round2(dto.amountBs) : null;
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

  // ── Movimientos Bs (ledger propio + fusión con Bs de divisas) ────────────
  private readonly BS_MOVEMENT_INCLUDE = {
    company: { select: { id: true, name: true } },
    createdBy: { select: { name: true } },
  };

  /**
   * Ledger Bs por empresa: fusiona los TreasuryBsMovement propios (source 'BS',
   * editables) con el amountBs de los TreasuryMovement de divisas (source 'DIVISA',
   * solo lectura, con signo corregido: divisa ENTRADA = salida de Bs, divisa SALIDA
   * = entrada de Bs). Devuelve saldo corriente cuando se filtra por UNA empresa sin tipo.
   */
  async findBsMovements(q: QueryBsMovementsDto) {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    const withRunning = !!q.companyId && !q.type;

    const bsWhere: any = {};
    if (q.companyId) bsWhere.companyId = q.companyId;
    const divWhere: any = { amountBs: { not: null } };
    if (q.companyId) divWhere.companyId = q.companyId;

    const [bsRows, divRows] = await Promise.all([
      this.prisma.treasuryBsMovement.findMany({ where: bsWhere, include: this.BS_MOVEMENT_INCLUDE }),
      this.prisma.treasuryMovement.findMany({ where: divWhere, include: this.BS_MOVEMENT_INCLUDE }),
    ]);

    const normBs = bsRows.map((m) => ({
      id: m.id,
      date: m.date,
      type: m.type,
      amountBs: m.amountBs,
      status: m.status,
      counterparty: m.counterparty,
      reference: m.reference,
      description: m.description,
      company: (m as any).company,
      createdBy: (m as any).createdBy,
      source: 'BS' as const,
      refMovementId: null as string | null,
      createdAt: m.createdAt,
    }));
    const normDiv = divRows.map((m) => ({
      id: m.id,
      date: m.date,
      // divisa ENTRADA (compra USD, paga Bs) => SALIDA de Bs; divisa SALIDA => ENTRADA de Bs
      type: m.type === 'ENTRADA' ? 'SALIDA' : 'ENTRADA',
      amountBs: m.amountBs as number,
      status: m.status,
      counterparty: m.counterparty,
      reference: m.reference,
      description: m.description,
      company: (m as any).company,
      createdBy: (m as any).createdBy,
      source: 'DIVISA' as const,
      refMovementId: m.id,
      createdAt: m.createdAt,
    }));

    let all = [...normBs, ...normDiv];
    if (q.type) all = all.filter((r) => r.type === q.type);
    all.sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
    );

    if (withRunning) {
      let bal = 0;
      all = all.map((r) => {
        if (r.status !== 'PENDIENTE') bal += signed(r.type, r.amountBs);
        return { ...r, runningBalanceBs: round2(bal) } as any;
      });
    }

    let rows = all;
    if (from) rows = rows.filter((r) => r.date >= from);
    if (to) rows = rows.filter((r) => r.date <= to);
    rows = rows.slice().reverse(); // más recientes primero
    return { movements: rows, hasRunningBalance: withRunning };
  }

  async createBsMovement(dto: CreateBsMovementDto, userId: string) {
    const company = await this.prisma.treasuryCompany.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Empresa no válida');
    return this.prisma.treasuryBsMovement.create({
      data: {
        date: new Date(dto.date),
        companyId: dto.companyId,
        type: dto.type,
        amountBs: round2(dto.amountBs),
        counterparty: dto.counterparty?.trim() || null,
        reference: dto.reference?.trim() || null,
        description: dto.description?.trim() || null,
        status: dto.status || 'CONFIRMADO',
        createdById: userId,
      },
      include: this.BS_MOVEMENT_INCLUDE,
    });
  }

  async updateBsMovement(id: string, dto: Partial<CreateBsMovementDto>) {
    const existing = await this.prisma.treasuryBsMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento Bs no encontrado');
    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.companyId !== undefined) data.companyId = dto.companyId;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.amountBs !== undefined) data.amountBs = round2(dto.amountBs);
    if (dto.counterparty !== undefined) data.counterparty = dto.counterparty?.trim() || null;
    if (dto.reference !== undefined) data.reference = dto.reference?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.treasuryBsMovement.update({ where: { id }, data, include: this.BS_MOVEMENT_INCLUDE });
  }

  async deleteBsMovement(id: string) {
    const existing = await this.prisma.treasuryBsMovement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Movimiento Bs no encontrado');
    await this.prisma.treasuryBsMovement.delete({ where: { id } });
    return { ok: true };
  }
}
