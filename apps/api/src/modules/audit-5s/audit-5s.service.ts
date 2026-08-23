import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { CreateAudit5SDto } from './dto/create-audit-5s.dto';
import { QueryAudit5SDto } from './dto/query-audit-5s.dto';

// Indice 5S: suma de los 3 puntajes sobre 15 puntos maximos.
export function computeIndex5s(a: {
  scoreCleanliness: number;
  scoreOrder: number;
  scoreSafety: number;
}): number {
  return Math.round(((a.scoreCleanliness + a.scoreOrder + a.scoreSafety) / 15) * 100);
}

@Injectable()
export class Audit5SService {
  constructor(private readonly prisma: PrismaService) {}

  private withIndex<
    T extends { scoreCleanliness: number; scoreOrder: number; scoreSafety: number },
  >(a: T) {
    return { ...a, index5s: computeIndex5s(a) };
  }

  /** Correlativo AUD-0001 con SELECT FOR UPDATE (regla de correlativos del repo). */
  private async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "Audit5S" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `AUD-${next.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateAudit5SDto, userId: string) {
    // Fecha-calendario del turno anclada a medianoche UTC de la fecha-Caracas (date-only).
    const date = caracasDateKey(dto.date);

    const audit = await this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.audit5S.create({
        data: {
          number,
          date,
          zone: dto.zone.trim(),
          scoreCleanliness: dto.scoreCleanliness,
          scoreOrder: dto.scoreOrder,
          scoreSafety: dto.scoreSafety,
          observations: dto.observations?.trim() || null,
          createdById: userId,
        },
        include: { createdBy: { select: { name: true } } },
      });
    });
    return this.withIndex(audit);
  }

  async findOne(id: string) {
    const audit = await this.prisma.audit5S.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true } } },
    });
    if (!audit) throw new NotFoundException(`Auditoría ${id} no encontrada`);
    return this.withIndex(audit);
  }

  async findAll(query: QueryAudit5SDto) {
    const where: any = {};
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = caracasDateKey(query.from);
      if (query.to) where.date.lte = caracasDateKey(query.to);
    }
    if (query.zone) where.zone = { contains: query.zone, mode: 'insensitive' };

    const data = await this.prisma.audit5S.findMany({
      where,
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return data.map((a) => this.withIndex(a));
  }

  // Promedio de indice por zona (para KPI). Respeta los mismos filtros del listado.
  async summary(query: QueryAudit5SDto) {
    const rows = await this.findAll(query);
    const byZoneMap: Record<string, { sum: number; count: number }> = {};
    for (const r of rows) {
      const agg = byZoneMap[r.zone] || { sum: 0, count: 0 };
      agg.sum += r.index5s;
      agg.count += 1;
      byZoneMap[r.zone] = agg;
    }
    const byZone = Object.entries(byZoneMap)
      .map(([zone, { sum, count }]) => ({ zone, count, avgIndex: Math.round(sum / count) }))
      .sort((a, b) => a.zone.localeCompare(b.zone));
    const total = rows.length;
    const avgIndex = total ? Math.round(rows.reduce((s, r) => s + r.index5s, 0) / total) : 0;
    return { total, avgIndex, byZone };
  }
}
