import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Categoria padre no encontrada');
      if (parent.parentId) throw new BadRequestException('Solo se permiten 2 niveles de categorias');
    }
    return this.prisma.category.create({
      data: dto,
      include: { parent: true, children: true },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true, products: { select: { id: true } } },
    });
    if (!category) throw new NotFoundException('Categoria no encontrada');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Categoria padre no encontrada');
      if (parent.parentId) throw new BadRequestException('Solo se permiten 2 niveles de categorias');
      if (dto.parentId === id) throw new BadRequestException('Una categoria no puede ser su propio padre');
    }
    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: { parent: true, children: true },
    });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category.children.length > 0) {
      throw new BadRequestException('No se puede eliminar una categoria con subcategorias');
    }
    if (category.products.length > 0) {
      throw new BadRequestException('No se puede eliminar una categoria con productos asociados');
    }
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Categoria eliminada' };
  }
}
