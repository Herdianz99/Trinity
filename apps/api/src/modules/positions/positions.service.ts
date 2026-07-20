import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePositionDto) {
    try {
      return await this.prisma.position.create({
        data: {
          name: dto.name.trim(),
          defaultSalaryUsd: dto.defaultSalaryUsd ?? 0,
          defaultBonusUsd: dto.defaultBonusUsd ?? 0,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un cargo con ese nombre');
      }
      throw e;
    }
  }

  async findAll() {
    return this.prisma.position.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) throw new NotFoundException('Cargo no encontrado');
    return position;
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.findOne(id);
    try {
      return await this.prisma.position.update({
        where: { id },
        data: { ...dto, ...(dto.name !== undefined ? { name: dto.name.trim() } : {}) },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un cargo con ese nombre');
      }
      throw e;
    }
  }

  async remove(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!position) throw new NotFoundException('Cargo no encontrado');
    if (position._count.employees > 0) {
      throw new BadRequestException('No se puede eliminar un cargo con empleados asociados');
    }
    await this.prisma.position.delete({ where: { id } });
    return { message: 'Cargo eliminado' };
  }
}
