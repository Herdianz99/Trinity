import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePrintAreaDto } from './dto/create-print-area.dto';
import { UpdatePrintAreaDto } from './dto/update-print-area.dto';

@Injectable()
export class PrintAreasService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePrintAreaDto) {
    return this.prisma.printArea.create({ data: dto });
  }

  async findAll() {
    return this.prisma.printArea.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { categories: true } } },
    });
  }

  async findOne(id: string) {
    const area = await this.prisma.printArea.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Area de impresion no encontrada');
    return area;
  }

  async update(id: string, dto: UpdatePrintAreaDto) {
    await this.findOne(id);
    return this.prisma.printArea.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const area = await this.prisma.printArea.findUnique({
      where: { id },
      include: { _count: { select: { categories: true } } },
    });
    if (!area) throw new NotFoundException('Area de impresion no encontrada');
    if (area._count.categories > 0) {
      throw new BadRequestException('No se puede eliminar un area con categorias asociadas');
    }
    await this.prisma.printArea.delete({ where: { id } });
    return { message: 'Area de impresion eliminada' };
  }
}
