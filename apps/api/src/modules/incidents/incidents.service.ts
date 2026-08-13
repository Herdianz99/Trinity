import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { CreateIncidentTypeDto } from './dto/create-incident-type.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';

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
        include: {
          type: { select: { id: true, name: true } },
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
            attachments: { create: uploaded },
          },
          include: {
            type: { select: { name: true } },
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
