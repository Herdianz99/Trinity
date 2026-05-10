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

    // Root categories require code
    if (!dto.parentId) {
      if (!dto.code) {
        throw new BadRequestException('El codigo de categoria es obligatorio');
      }
      const code = dto.code.toUpperCase();
      const existing = await this.prisma.category.findUnique({ where: { code } });
      if (existing) {
        throw new BadRequestException(`El codigo "${code}" ya esta en uso`);
      }
      dto.code = code;
    } else {
      // Subcategories don't have codes
      delete dto.code;
    }

    return this.prisma.category.create({
      data: dto,
      include: { parent: true, children: true, printArea: true },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
        },
        printArea: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true, products: { select: { id: true } }, printArea: true },
    });
    if (!category) throw new NotFoundException('Categoria no encontrada');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.findOne(id);
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Categoria padre no encontrada');
      if (parent.parentId) throw new BadRequestException('Solo se permiten 2 niveles de categorias');
      if (dto.parentId === id) throw new BadRequestException('Una categoria no puede ser su propio padre');
    }

    // Validate code uniqueness if changing
    if (dto.code) {
      const code = dto.code.toUpperCase();
      const dup = await this.prisma.category.findUnique({ where: { code } });
      if (dup && dup.id !== id) {
        throw new BadRequestException(`El codigo "${code}" ya esta en uso`);
      }
      dto.code = code;
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: { parent: true, children: true, printArea: true },
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
