import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateFaultTypeDto } from './dto/create-fault-type.dto';
import { CreateDisciplinaryActionDto } from './dto/create-disciplinary-action.dto';
import { QueryDisciplinaryDto } from './dto/query-disciplinary.dto';

// El nivel sale del ordinal del hilo (empleado+falta): 1=Llamado, 2=Notificacion, 3+=Amonestacion.
export function levelForSequence(seq: number): string {
  if (seq <= 1) return 'LLAMADO';
  if (seq === 2) return 'NOTIFICACION';
  return 'AMONESTACION';
}

@Injectable()
export class DisciplinaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  private withPhotoUrls<
    T extends { attachments?: { id: string; thumbKey: string; mediumKey: string }[] },
  >(a: T) {
    const atts = a.attachments || [];
    const { attachments, ...rest } = a as any;
    return {
      ...rest,
      photos: atts.map((x) => ({
        id: x.id,
        thumbUrl: this.spaces.cdnUrl(x.thumbKey),
        mediumUrl: this.spaces.cdnUrl(x.mediumKey),
      })),
    };
  }

  // ============ TIPOS DE FALTA (abiertos a cualquiera con modulo 'payroll') ============

  findAllTypes() {
    return this.prisma.faultType.findMany({ orderBy: { name: 'asc' } });
  }

  findActiveTypes() {
    return this.prisma.faultType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async createType(dto: CreateFaultTypeDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre del tipo de falta es obligatorio');
    const exists = await this.prisma.faultType.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('Ya existe un tipo de falta con ese nombre');
    return this.prisma.faultType.create({ data: { name, isActive: dto.isActive ?? true } });
  }

  async updateType(id: string, dto: Partial<CreateFaultTypeDto>) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.faultType.update({ where: { id }, data });
  }

  async toggleTypeActive(id: string) {
    const t = await this.prisma.faultType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipo de falta no encontrado');
    return this.prisma.faultType.update({ where: { id }, data: { isActive: !t.isActive } });
  }

  // ============ AMONESTACIONES ============

  private buildWhere(query: QueryDisciplinaryDto) {
    const where: any = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.faultTypeId) where.faultTypeId = query.faultTypeId;
    if (query.level) where.level = query.level;
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = caracasDayStart(query.from);
      if (query.to) where.occurredAt.lte = caracasDayEnd(query.to);
    }
    return where;
  }

  async findAll(query: QueryDisciplinaryDto) {
    const where = this.buildWhere(query);
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const [data, total] = await Promise.all([
      this.prisma.disciplinaryAction.findMany({
        where,
        include: {
          faultType: { select: { id: true, name: true } },
          employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
          createdBy: { select: { name: true } },
          attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.disciplinaryAction.count({ where }),
    ]);
    return { data: data.map((d) => this.withPhotoUrls(d)), total, page, limit };
  }

  // Vista por empleado: agrupa por tipo de falta en "hilos" para el stepper.
  async byEmployee(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        code: true,
        customer: { select: { name: true, rif: true, documentType: true } },
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!employee) throw new NotFoundException('Empleado no encontrado');

    const actions = await this.prisma.disciplinaryAction.findMany({
      where: { employeeId },
      include: {
        faultType: { select: { id: true, name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: [{ faultTypeId: 'asc' }, { sequence: 'asc' }],
    });

    const threadsMap = new Map<
      string,
      { faultType: { id: string; name: string }; count: number; maxLevel: string; actions: any[] }
    >();
    for (const a of actions) {
      let t = threadsMap.get(a.faultTypeId);
      if (!t) {
        t = { faultType: a.faultType, count: 0, maxLevel: 'LLAMADO', actions: [] };
        threadsMap.set(a.faultTypeId, t);
      }
      t.count++;
      t.maxLevel = levelForSequence(t.count);
      t.actions.push(this.withPhotoUrls(a));
    }
    return { employee, threads: Array.from(threadsMap.values()) };
  }

  async findOne(id: string) {
    const a = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: {
        faultType: { select: { id: true, name: true } },
        employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
        createdBy: { select: { name: true } },
        attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!a) throw new NotFoundException('Llamado no encontrado');
    return this.withPhotoUrls(a);
  }

  async create(dto: CreateDisciplinaryActionDto, userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new BadRequestException('Empleado no encontrado');
    const faultType = await this.prisma.faultType.findUnique({ where: { id: dto.faultTypeId } });
    if (!faultType) throw new BadRequestException('Tipo de falta no encontrado');
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('El motivo es obligatorio');
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const rawPhotos = dto.photos?.length ? dto.photos : [];
    if (rawPhotos.length > 8) throw new BadRequestException('Máximo 8 fotos por llamado');

    // Fotos a Spaces ANTES de crear la fila (rollback safety), igual que incidents.
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
        const thumbKey = `disciplinary/${stamp}-${rand}-thumb.webp`;
        const mediumKey = `disciplinary/${stamp}-${rand}-medium.webp`;
        await Promise.all([
          this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
          this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
        ]);
        uploaded.push({ thumbKey, mediumKey });
      }

      const action = await this.prisma.$transaction(async (tx) => {
        // Conteo del hilo (empleado+falta) → escalado.
        const n = await tx.disciplinaryAction.count({
          where: { employeeId: dto.employeeId, faultTypeId: dto.faultTypeId },
        });
        const sequence = n + 1;
        const level = levelForSequence(sequence);
        // Correlativo LA-XXXX (zero-padded → orden desc por número sirve).
        const last = await tx.disciplinaryAction.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
        const lastNum = last ? parseInt(last.number.replace(/\D/g, ''), 10) || 0 : 0;
        const number = `LA-${String(lastNum + 1).padStart(4, '0')}`;

        return tx.disciplinaryAction.create({
          data: {
            number,
            employeeId: dto.employeeId,
            faultTypeId: dto.faultTypeId,
            sequence,
            level,
            occurredAt,
            reason,
            createdById: userId,
            attachments: { create: uploaded },
          },
          include: {
            faultType: { select: { id: true, name: true } },
            employee: { select: { id: true, code: true, customer: { select: { name: true } } } },
            createdBy: { select: { name: true } },
            attachments: { select: { id: true, thumbKey: true, mediumKey: true }, orderBy: { createdAt: 'asc' } },
          },
        });
      });
      return this.withPhotoUrls(action);
    } catch (e) {
      await Promise.all(
        uploaded.flatMap((u) => [this.spaces.delete(u.thumbKey), this.spaces.delete(u.mediumKey)]),
      );
      throw e;
    }
  }

  async remove(id: string) {
    const action = await this.prisma.disciplinaryAction.findUnique({
      where: { id },
      include: { attachments: { select: { thumbKey: true, mediumKey: true } } },
    });
    if (!action) throw new NotFoundException('Llamado no encontrado');

    // Solo se puede eliminar el ÚLTIMO del hilo (mayor sequence en empleado+falta).
    const agg = await this.prisma.disciplinaryAction.aggregate({
      where: { employeeId: action.employeeId, faultTypeId: action.faultTypeId },
      _max: { sequence: true },
    });
    if (action.sequence !== agg._max.sequence) {
      throw new BadRequestException('Solo se puede eliminar el último llamado de cada tipo de falta');
    }

    await this.prisma.disciplinaryAction.delete({ where: { id } });
    await Promise.all(
      action.attachments.flatMap((a) => [this.spaces.delete(a.thumbKey), this.spaces.delete(a.mediumKey)]),
    );
    return { ok: true };
  }
}
