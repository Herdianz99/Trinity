import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIslrTypeDto } from './dto/create-islr-type.dto';
import { UpdateIslrTypeDto } from './dto/update-islr-type.dto';

@Injectable()
export class IslrRetentionTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { active?: string; supplierType?: string }) {
    const where: any = {};

    if (query.active === 'true') where.isActive = true;
    if (query.active === 'false') where.isActive = false;

    // Filter by supplier type
    if (query.supplierType === 'JURIDICA') {
      where.forPersonaJuridica = true;
    } else if (query.supplierType === 'NATURAL_RESIDENTE') {
      where.forPersonaResidente = true;
    } else if (query.supplierType === 'NATURAL_NO_RESIDENTE') {
      // PNNR: neither juridica nor residente specific — return all that are not exclusively for one
      where.forPersonaJuridica = false;
      where.forPersonaResidente = false;
    }

    return this.prisma.islrRetentionType.findMany({
      where,
      orderBy: { codigo: 'asc' },
    });
  }

  async findOne(id: string) {
    const type = await this.prisma.islrRetentionType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Tipo de retención ISLR no encontrado');
    return type;
  }

  async create(dto: CreateIslrTypeDto) {
    const existing = await this.prisma.islrRetentionType.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existing) {
      throw new BadRequestException(`Ya existe un tipo con código ${dto.codigo}`);
    }

    return this.prisma.islrRetentionType.create({
      data: {
        codigo: dto.codigo,
        descripcion: dto.descripcion,
        baseImponiblePct: dto.baseImponiblePct ?? 100,
        retentionPct: dto.retentionPct,
        sustraendoUt: dto.sustraendoUt ?? 0,
        forPersonaJuridica: dto.forPersonaJuridica ?? false,
        forPersonaResidente: dto.forPersonaResidente ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateIslrTypeDto) {
    await this.findOne(id);
    return this.prisma.islrRetentionType.update({
      where: { id },
      data: dto,
    });
  }

  async toggle(id: string) {
    const type = await this.findOne(id);
    return this.prisma.islrRetentionType.update({
      where: { id },
      data: { isActive: !type.isActive },
    });
  }
}
