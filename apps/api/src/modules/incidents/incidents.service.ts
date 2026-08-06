import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ TIPOS (abiertos a cualquiera con el módulo 'incidents', NO solo ADMIN) ============

  findAllTypes() {
    return this.prisma.incidentType.findMany({ orderBy: { name: 'asc' } });
  }

  findActiveTypes() {
    return this.prisma.incidentType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async createType(dto: CreateIncidentTypeDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del tipo es obligatorio');
    const exists = await this.prisma.incidentType.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Ya existe un tipo con ese nombre');
    return this.prisma.incidentType.create({ data: { name, isActive: dto.isActive ?? true } });
  }

  async updateType(id: string, dto: Partial<CreateIncidentTypeDto>) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.incidentType.update({ where: { id }, data });
  }

  async toggleTypeActive(id: string) {
    const type = await this.prisma.incidentType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Tipo no encontrado');
    return this.prisma.incidentType.update({ where: { id }, data: { isActive: !type.isActive } });
  }

  // ============ INCIDENCIAS ============

  private buildWhere(query: QueryIncidentsDto) {
    const where: any = {};
    if (query.typeId) where.typeId = query.typeId;
    if (query.severity) where.severity = query.severity;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = caracasDayStart(query.from);
      if (query.to) where.occurredAt.lte = caracasDayEnd(query.to);
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { involvedName: { contains: query.search, mode: 'insensitive' } },
        { number: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  async findAll(query: QueryIncidentsDto) {
    const where = this.buildWhere(query);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: { type: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  // Resumen para KPIs + gráfica (respeta los mismos filtros del listado).
  async summary(query: QueryIncidentsDto) {
    const where = this.buildWhere(query);
    const incidents = await this.prisma.incident.findMany({
      where,
      select: { severity: true, type: { select: { name: true } } },
    });
    const byTypeMap: Record<string, number> = {};
    const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const i of incidents) {
      byTypeMap[i.type.name] = (byTypeMap[i.type.name] || 0) + 1;
      bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
    }
    const byType = Object.entries(byTypeMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { total: incidents.length, byType, bySeverity };
  }

  async create(dto: CreateIncidentDto, userId: string) {
    const type = await this.prisma.incidentType.findUnique({ where: { id: dto.typeId } });
    if (!type) throw new BadRequestException('Tipo de incidencia no encontrado');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      // Correlativo INC-XXXX (los números vienen zero-padded → orden desc por número sirve).
      const last = await tx.incident.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
      const lastNum = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
      const number = `INC-${String(lastNum + 1).padStart(4, '0')}`;

      return tx.incident.create({
        data: {
          number,
          typeId: dto.typeId,
          description: dto.description,
          involvedName: dto.involvedName?.trim() || null,
          severity: dto.severity || 'MEDIUM',
          occurredAt,
          createdById: userId,
        },
        include: { type: { select: { name: true } }, createdBy: { select: { name: true } } },
      });
    });
  }
}
