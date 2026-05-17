import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ CATEGORIES ============

  async findAllCategories() {
    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findActiveCategories() {
    return this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede crear categorías de gastos');
    }
    return this.prisma.expenseCategory.create({
      data: { name: dto.name, description: dto.description },
    });
  }

  async updateCategory(id: string, dto: Partial<CreateExpenseCategoryDto>, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede editar categorías de gastos');
    }
    return this.prisma.expenseCategory.update({
      where: { id },
      data: dto,
    });
  }

  async toggleCategoryActive(id: string, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede activar/desactivar categorías');
    }
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    return this.prisma.expenseCategory.update({
      where: { id },
      data: { isActive: !category.isActive },
    });
  }

  // ============ EXPENSES ============

  async findAll(filters: {
    categoryId?: string;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.date.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: 'insensitive' } },
        { reference: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 25;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    return expense;
  }

  async getSummary(filters: { from?: string; to?: string }) {
    const where: any = {};

    if (filters.from || filters.to) {
      where.date = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.date.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      include: { category: { select: { name: true } } },
    });

    let totalUsd = 0;
    let totalBs = 0;
    const byCategoryMap: Record<string, { categoryName: string; totalUsd: number; totalBs: number; count: number }> = {};
    const byMonthMap: Record<string, { month: string; totalUsd: number; totalBs: number }> = {};

    for (const exp of expenses) {
      totalUsd += exp.amountUsd;
      totalBs += exp.amountBs;

      // By category
      if (!byCategoryMap[exp.categoryId]) {
        byCategoryMap[exp.categoryId] = { categoryName: exp.category.name, totalUsd: 0, totalBs: 0, count: 0 };
      }
      byCategoryMap[exp.categoryId].totalUsd += exp.amountUsd;
      byCategoryMap[exp.categoryId].totalBs += exp.amountBs;
      byCategoryMap[exp.categoryId].count += 1;

      // By month
      const monthKey = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonthMap[monthKey]) {
        byMonthMap[monthKey] = { month: monthKey, totalUsd: 0, totalBs: 0 };
      }
      byMonthMap[monthKey].totalUsd += exp.amountUsd;
      byMonthMap[monthKey].totalBs += exp.amountBs;
    }

    return {
      totalUsd: Math.round(totalUsd * 100) / 100,
      totalBs: Math.round(totalBs * 100) / 100,
      byCategory: Object.values(byCategoryMap).map(c => ({
        ...c,
        totalUsd: Math.round(c.totalUsd * 100) / 100,
        totalBs: Math.round(c.totalBs * 100) / 100,
      })),
      byMonth: Object.values(byMonthMap).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  async create(dto: CreateExpenseDto, userId: string) {
    // Get today's exchange rate
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });

    if (!rate) {
      throw new BadRequestException('No hay tasa de cambio registrada para hoy. Registre la tasa antes de crear gastos.');
    }

    let amountUsd = dto.amountUsd;
    let amountBs = dto.amountBs;

    if (amountUsd && !amountBs) {
      amountBs = Math.round(amountUsd * rate.rate * 100) / 100;
    } else if (amountBs && !amountUsd) {
      amountUsd = Math.round((amountBs / rate.rate) * 100) / 100;
    } else if (!amountUsd && !amountBs) {
      throw new BadRequestException('Debe proporcionar al menos un monto (USD o Bs)');
    }

    return this.prisma.expense.create({
      data: {
        categoryId: dto.categoryId,
        description: dto.description,
        reference: dto.reference,
        amountUsd: amountUsd!,
        amountBs: amountBs!,
        exchangeRate: rate.rate,
        date: new Date(dto.date),
        notes: dto.notes,
        createdById: userId,
      },
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  async update(id: string, dto: Partial<CreateExpenseDto>, user: { id: string; role: UserRole }) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    if (user.role !== UserRole.ADMIN && expense.createdById !== user.id) {
      throw new ForbiddenException('Solo el creador o ADMIN puede editar este gasto');
    }

    const updateData: any = {};
    if (dto.categoryId) updateData.categoryId = dto.categoryId;
    if (dto.description) updateData.description = dto.description;
    if (dto.reference !== undefined) updateData.reference = dto.reference;
    if (dto.date) updateData.date = new Date(dto.date);
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    if (dto.amountUsd !== undefined || dto.amountBs !== undefined) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
      if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');

      if (dto.amountUsd && dto.amountBs) {
        updateData.amountUsd = dto.amountUsd;
        updateData.amountBs = dto.amountBs;
      } else if (dto.amountUsd) {
        updateData.amountUsd = dto.amountUsd;
        updateData.amountBs = Math.round(dto.amountUsd * rate.rate * 100) / 100;
      } else if (dto.amountBs) {
        updateData.amountBs = dto.amountBs;
        updateData.amountUsd = Math.round((dto.amountBs / rate.rate) * 100) / 100;
      }
      updateData.exchangeRate = rate.rate;
    }

    return this.prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  async delete(id: string, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede eliminar gastos');
    }
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    return this.prisma.expense.delete({ where: { id } });
  }
}
