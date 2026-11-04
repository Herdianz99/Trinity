import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { IncidentDepartmentDto } from './dto/incident-department.dto';
import { IncidentScope, ScopeUser } from './incidents-scope';

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  // Agrega el arreglo `photos` (con URLs de CDN) a una incidencia a partir de sus adjuntos.
  private withPhotoUrls<
    T extends { attachments?: { id: string; thumbKey: string; mediumKey: string }[] },
  >(inc: T) {
    const atts = inc.attachments || [];
    const { attachments, ...rest } = inc as any;
    return {
      ...rest,
      photos: atts.map((a) => ({
        id: a.id,
        thumbUrl: this.spaces.cdnUrl(a.thumbKey),
        mediumUrl: this.spaces.cdnUrl(a.mediumKey),
      })),
    };
  }

  // ============ ALCANCE POR DEPARTAMENTO ============

  async getScope(user: ScopeUser): Promise<IncidentScope> {
    const depts = await this.prisma.incidentDepartment.findMany({
      select: { id: true, isActive: true, roles: true, viewerDepartmentIds: true },
    });
    if (user.role === 'ADMIN') {
      const all = depts.map((d) => d.id);
      return { isAdmin: true, memberIds: depts.filter((d) => d.isActive).map((d) => d.id), visibleIds: all };
    }
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { incidentDepartmentId: true } });
    const active = depts.filter((d) => d.isActive);
    const memberIds = active
      .filter((d) => (d.roles || []).includes(user.role) || d.id === u?.incidentDepartmentId)
      .map((d) => d.id);
    const visible = new Set(memberIds);
    for (const d of active) {
      if ((d.viewerDepartmentIds || []).some((v) => memberIds.includes(v))) visible.add(d.id);
    }
    return { isAdmin: false, memberIds, visibleIds: Array.from(visible) };
  }

  // Lo que necesita la pantalla: departamentos donde puede crear y los que puede ver.
  async myScope(user: ScopeUser) {
    const scope = await this.getScope(user);
    const depts = await this.prisma.incidentDepartment.findMany({
      where: { id: { in: scope.visibleIds } },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: 'asc' },
    });
    return {
      isAdmin: scope.isAdmin,
      createDepartments: depts.filter((d) => scope.memberIds.includes(d.id)),
      visibleDepartments: depts,
    };
  }

  // Filtro de departamento para listados/resumen/reportes (respeta el alcance).
  departmentWhere(scope: IncidentScope, departmentId?: string) {
    if (departmentId) {
      if (!scope.visibleIds.includes(departmentId)) return { departmentId: '__none__' };
      return { departmentId };
    }
    return scope.isAdmin ? {} : { departmentId: { in: scope.visibleIds } };
  }

  private resolveDepartment(scope: IncidentScope, departmentId?: string) {
    if (departmentId) {
      if (!scope.memberIds.includes(departmentId)) {
        throw new ForbiddenException('No puedes registrar en ese departamento');
      }
      return departmentId;
    }
    if (scope.memberIds.length === 1) return scope.memberIds[0];
    if (scope.memberIds.length === 0) {
      throw new ForbiddenException('No perteneces a ningún departamento de incidencias');
    }
    throw new BadRequestException('Elige el departamento');
  }

  // ============ DEPARTAMENTOS (solo ADMIN) ============

  async findAllDepartments() {
    const depts = await this.prisma.incidentDepartment.findMany({
      orderBy: { name: 'asc' },
      include: {
        members: { select: { id: true, name: true, role: true } },
        _count: { select: { incidents: true, types: true } },
      },
    });
    return depts;
  }

  // Usuarios activos para elegir miembros (con su departamento asignado a mano, si tiene).
  departmentUserOptions() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { notIn: ['CLIENT'] as any } },
      select: { id: true, name: true, role: true, incidentDepartmentId: true },
      orderBy: { name: 'asc' },
    });
  }

  private async saveDepartmentRelations(tx: any, id: string, dto: Partial<IncidentDepartmentDto>) {
    if (dto.memberIds) {
      await tx.user.updateMany({
        where: { incidentDepartmentId: id, id: { notIn: dto.memberIds } },
        data: { incidentDepartmentId: null },
      });
      if (dto.memberIds.length) {
        await tx.user.updateMany({ where: { id: { in: dto.memberIds } }, data: { incidentDepartmentId: id } });
      }
    }
  }

  private cleanDepartmentData(dto: Partial<IncidentDepartmentDto>, selfId?: string) {
    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      if (!data.name) throw new BadRequestException('El nombre del departamento es obligatorio');
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.roles !== undefined) data.roles = Array.from(new Set(dto.roles.filter(Boolean)));
    if (dto.viewerDepartmentIds !== undefined) {
      data.viewerDepartmentIds = Array.from(new Set(dto.viewerDepartmentIds.filter((v) => v && v !== selfId)));
    }
    return data;
  }

  async createDepartment(dto: IncidentDepartmentDto) {
    const data = this.cleanDepartmentData(dto);
    const exists = await this.prisma.incidentDepartment.findUnique({ where: { name: data.name } });
    if (exists) throw new BadRequestException('Ya existe un departamento con ese nombre');
    return this.prisma.$transaction(async (tx) => {
      const dept = await tx.incidentDepartment.create({ data });
      await this.saveDepartmentRelations(tx, dept.id, dto);
      return dept;
    });
  }

  async updateDepartment(id: string, dto: Partial<IncidentDepartmentDto>) {
    const dept = await this.prisma.incidentDepartment.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Departamento no encontrado');
    const data = this.cleanDepartmentData(dto, id);
    if (data.name && data.name !== dept.name) {
      const exists = await this.prisma.incidentDepartment.findUnique({ where: { name: data.name } });
      if (exists) throw new BadRequestException('Ya existe un departamento con ese nombre');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incidentDepartment.update({ where: { id }, data });
      await this.saveDepartmentRelations(tx, id, dto);
      return updated;
    });
  }

  // ============ TIPOS (cada miembro gestiona los de su departamento; ADMIN todos) ============

  async findAllTypes(user: ScopeUser) {
    const scope = await this.getScope(user);
    return this.prisma.incidentType.findMany({
      where: scope.isAdmin ? {} : { departmentId: { in: scope.memberIds } },
      include: { department: { select: { id: true, name: true } } },
      orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  // Tipos activos de los departamentos que ve (filtro del listado y formulario de registro).
  async findActiveTypes(user: ScopeUser) {
    const scope = await this.getScope(user);
    return this.prisma.incidentType.findMany({
      where: { isActive: true, departmentId: { in: scope.visibleIds } },
      select: { id: true, name: true, departmentId: true, department: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  private async assertTypeManageable(id: string, user: ScopeUser) {
    const type = await this.prisma.incidentType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Tipo no encontrado');
    const scope = await this.getScope(user);
    if (!scope.isAdmin && !scope.memberIds.includes(type.departmentId)) {
      throw new ForbiddenException('Ese tipo es de otro departamento');
    }
    return type;
  }

  async createType(dto: CreateIncidentTypeDto, user: ScopeUser) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del tipo es obligatorio');
    const scope = await this.getScope(user);
    const departmentId = this.resolveDepartment(scope, dto.departmentId);
    const exists = await this.prisma.incidentType.findUnique({ where: { departmentId_name: { departmentId, name } } });
    if (exists) throw new BadRequestException('Ya existe un tipo con ese nombre en el departamento');
    return this.prisma.incidentType.create({ data: { name, departmentId, isActive: dto.isActive ?? true } });
  }

  async updateType(id: string, dto: Partial<CreateIncidentTypeDto>, user: ScopeUser) {
    const type = await this.assertTypeManageable(id, user);
    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      if (!data.name) throw new BadRequestException('El nombre del tipo es obligatorio');
      const dup = await this.prisma.incidentType.findUnique({
        where: { departmentId_name: { departmentId: type.departmentId, name: data.name } },
      });
      if (dup && dup.id !== id) throw new BadRequestException('Ya existe un tipo con ese nombre en el departamento');
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.incidentType.update({ where: { id }, data });
  }

  async toggleTypeActive(id: string, user: ScopeUser) {
    const type = await this.assertTypeManageable(id, user);
    return this.prisma.incidentType.update({ where: { id }, data: { isActive: !type.isActive } });
  }

  // ============ INCIDENCIAS ============

  buildWhere(query: QueryIncidentsDto, scope: IncidentScope) {
    const where: any = { ...this.departmentWhere(scope, query.departmentId) };
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

  async findAll(query: QueryIncidentsDto, user: ScopeUser) {
    const where = this.buildWhere(query, await this.getScope(user));
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const [data, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: {
          type: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
          attachments: {
            select: { id: true, thumbKey: true, mediumKey: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { data: data.map((i) => this.withPhotoUrls(i)), total, page, limit };
  }

  // Resumen para KPIs + gráfica (respeta los mismos filtros del listado).
  async summary(query: QueryIncidentsDto, user: ScopeUser) {
    const where = this.buildWhere(query, await this.getScope(user));
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

  async create(dto: CreateIncidentDto, user: ScopeUser) {
    const scope = await this.getScope(user);
    const departmentId = this.resolveDepartment(scope, dto.departmentId);
    const type = await this.prisma.incidentType.findUnique({ where: { id: dto.typeId } });
    if (!type) throw new BadRequestException('Tipo de incidencia no encontrado');
    if (type.departmentId !== departmentId) {
      throw new BadRequestException('Ese tipo de incidencia es de otro departamento');
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    // Fotos opcionales (varias): se validan y suben a Spaces ANTES de crear la fila (mismo
    // patrón que product-images). Si la creación falla después, se compensan los objetos
    // huérfanos. Se acepta `photos` (nuevo) o `photo` (legacy, una sola).
    const rawPhotos = dto.photos?.length ? dto.photos : dto.photo ? [dto.photo] : [];
    if (rawPhotos.length > 8) {
      throw new BadRequestException('Máximo 8 fotos por incidencia');
    }

    const uploaded: { thumbKey: string; mediumKey: string }[] = [];
    try {
      for (const photo of rawPhotos) {
        let processed;
        try {
          processed = await processProductImage(dataUriToBuffer(photo));
        } catch {
          throw new BadRequestException('Una de las fotos no es una imagen válida');
        }
        const stamp = Date.now().toString(36);
        const rand = Math.random().toString(36).slice(2, 8);
        const thumbKey = `incidents/${stamp}-${rand}-thumb.webp`;
        const mediumKey = `incidents/${stamp}-${rand}-medium.webp`;
        await Promise.all([
          this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
          this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
        ]);
        uploaded.push({ thumbKey, mediumKey });
      }

      const incident = await this.prisma.$transaction(async (tx) => {
        // Correlativo INC-XXXX (los números vienen zero-padded → orden desc por número sirve).
        // Un solo correlativo para toda la empresa, sin importar el departamento.
        const last = await tx.incident.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
        const lastNum = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
        const number = `INC-${String(lastNum + 1).padStart(4, '0')}`;

        return tx.incident.create({
          data: {
            number,
            typeId: dto.typeId,
            departmentId,
            description: dto.description,
            involvedName: dto.involvedName?.trim() || null,
            severity: dto.severity || 'MEDIUM',
            occurredAt,
            createdById: user.id,
            attachments: { create: uploaded },
          },
          include: {
            type: { select: { name: true } },
            department: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
            attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
          },
        });
      });
      return this.withPhotoUrls(incident);
    } catch (e) {
      await Promise.all(
        uploaded.flatMap((u) => [this.spaces.delete(u.thumbKey), this.spaces.delete(u.mediumKey)]),
      );
      throw e;
    }
  }
}
