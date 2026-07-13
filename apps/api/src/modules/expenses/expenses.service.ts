import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { caracasDateKey, caracasDayStart } from '../../common/timezone';
import { writeCashLedger } from '../../common/cash-ledger';

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
    // Tasa del gasto: la editada por el usuario tiene prioridad; si no, la del
    // dia de la FECHA del gasto (no la de hoy). Asi un gasto de otro dia usa su
    // tasa real, y los dias sin tasa guardada se cubren con la tasa manual.
    const rateVal = await this.resolveExpenseRate(dto.exchangeRate, dto.date);

    let amountUsd = dto.amountUsd;
    let amountBs = dto.amountBs;

    if (amountUsd && !amountBs) {
      amountBs = Math.round(amountUsd * rateVal * 100) / 100;
    } else if (amountBs && !amountUsd) {
      amountUsd = Math.round((amountBs / rateVal) * 100) / 100;
    } else if (!amountUsd && !amountBs) {
      throw new BadRequestException('Debe proporcionar al menos un monto (USD o Bs)');
    }

    // Gasto A CREDITO: se le debe a un proveedor. No mueve la caja ahora; genera
    // una CxP (Payable) que luego se paga con un recibo de pago (como una compra
    // a credito). El pago del recibo, atado a una caja, es el que mueve la gaveta.
    if (dto.isCredit) {
      if (!dto.supplierId) {
        throw new BadRequestException('Un gasto a credito requiere un proveedor (a quien se le debe)');
      }
      const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new BadRequestException('Proveedor no encontrado');

      const dueDate = new Date(dto.date);
      dueDate.setDate(dueDate.getDate() + (dto.creditDays || 0));

      return this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            categoryId: dto.categoryId,
            description: dto.description,
            reference: dto.reference,
            amountUsd: amountUsd!,
            amountBs: amountBs!,
            exchangeRate: rateVal,
            // caracasDayStart (medianoche Caracas, no new Date(dto.date)=medianoche UTC=8PM
            // dia anterior): el dashboard filtra Expense.date con caracasDayStart/End y
            // contaria el gasto en el dia equivocado. Mismo bug que documentDate en las NC.
            date: caracasDayStart(dto.date),
            notes: dto.notes,
            isCredit: true,
            creditDays: dto.creditDays,
            supplierId: dto.supplierId,
            createdById: userId,
          },
          include: {
            category: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        });

        await tx.payable.create({
          data: {
            supplierId: dto.supplierId!,
            expenseId: expense.id,
            description: `Gasto: ${dto.description}`,
            documentNumber: dto.reference,
            amountUsd: amountUsd!,
            amountBs: amountBs!,
            exchangeRate: rateVal,
            netPayableUsd: amountUsd!,
            netPayableBs: amountBs!,
            dueDate,
            status: 'PENDING',
            currency: dto.amountUsd ? 'USD' : 'BS',
          },
        });

        return expense;
      });
    }

    // If cashSessionId provided, validate session is OPEN and create CashMovement
    if (dto.cashSessionId) {
      const session = await this.prisma.cashSession.findUnique({
        where: { id: dto.cashSessionId },
      });
      if (!session) throw new BadRequestException('Sesion de caja no encontrada');
      if (session.status !== 'OPEN') throw new BadRequestException('La sesion de caja no esta abierta');

      // Moneda del movimiento = la del METODO de pago (Efectivo USD/Zelle -> USD; Efectivo Bs/
      // Punto/Pago Movil -> Bs), NO la del campo de monto que se llenó. Antes salía siempre 'USD'
      // (el front autocompleta ambos montos) y el arqueo restaba del efectivo USD aunque se pagara
      // en Bs -> descuadre. Fallback al monto solo si no hay método.
      const method = dto.methodId
        ? await this.prisma.paymentMethod.findUnique({ where: { id: dto.methodId }, select: { isDivisa: true, isCash: true } })
        : null;
      const movCurrency = method ? (method.isDivisa ? 'USD' : 'BS') : (dto.amountUsd ? 'USD' : 'BS');
      // ¿Sale de la gaveta física? Solo si el método es efectivo. Un gasto por transferencia/
      // Pago Móvil/Punto NO debe restar del efectivo del arqueo.
      const movIsCash = method ? method.isCash : true;

      return this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.create({
          data: {
            categoryId: dto.categoryId,
            description: dto.description,
            reference: dto.reference,
            amountUsd: amountUsd!,
            amountBs: amountBs!,
            exchangeRate: rateVal,
            date: caracasDayStart(dto.date),
            notes: dto.notes,
            createdById: userId,
            cashSessionId: dto.cashSessionId,
            methodId: dto.methodId,
          },
          include: {
            category: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        });

        await tx.cashMovement.create({
          data: {
            cashSessionId: dto.cashSessionId!,
            type: 'EXPENSE',
            amountUsd: amountUsd!,
            amountBs: amountBs!,
            exchangeRate: rateVal,
            currency: movCurrency,
            isCash: movIsCash,
            reason: `Gasto: ${dto.description}`,
            isManual: false,
            expenseId: expense.id,
            createdById: userId,
          },
        });

        await writeCashLedger(tx, {
          cashSessionId: dto.cashSessionId!,
          direction: 'OUT',
          amountUsd: amountUsd!, amountBs: amountBs!, currency: movCurrency as 'USD' | 'BS',
          exchangeRate: rateVal,
          methodId: dto.methodId || null, isCash: movIsCash,
          sourceType: 'EXPENSE', sourceId: expense.id,
          reason: `Gasto: ${dto.description}`, createdById: userId,
        });

        return expense;
      });
    }

    return this.prisma.expense.create({
      data: {
        categoryId: dto.categoryId,
        description: dto.description,
        reference: dto.reference,
        amountUsd: amountUsd!,
        amountBs: amountBs!,
        exchangeRate: rateVal,
        date: caracasDayStart(dto.date),
        notes: dto.notes,
        createdById: userId,
      },
      include: {
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
  }

  // Resuelve la tasa de un gasto: prioriza la editada por el usuario; si no,
  // busca la tasa guardada del dia de la FECHA del gasto. Lanza si no hay ninguna.
  private async resolveExpenseRate(edited: number | undefined, dateStr: string): Promise<number> {
    if (edited && edited > 0) return edited;
    const dateKey = caracasDateKey(dateStr);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: dateKey } });
    if (!rate) {
      throw new BadRequestException(
        'No hay tasa de cambio guardada para la fecha del gasto. Ingrese la tasa manualmente.',
      );
    }
    return rate.rate;
  }

  async update(id: string, dto: Partial<CreateExpenseDto>, user: { id: string; role: UserRole }) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { cashMovement: true, payable: { select: { id: true } } },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    if (user.role !== UserRole.ADMIN && expense.createdById !== user.id) {
      throw new ForbiddenException('Solo el creador o ADMIN puede editar este gasto');
    }

    // Gasto a credito con CxP: los montos/tasa/fecha viven en la cuenta por pagar.
    // Solo se permiten cambios no financieros (categoria/descripcion/referencia/notas).
    if (expense.payable && (dto.amountUsd !== undefined || dto.amountBs !== undefined || dto.exchangeRate !== undefined || dto.date !== undefined || dto.supplierId !== undefined)) {
      throw new BadRequestException(
        'Este gasto a credito ya genero una cuenta por pagar. Para cambiar montos, tasa, fecha o proveedor, gestiona la CxP.',
      );
    }

    const updateData: any = {};
    if (dto.categoryId) updateData.categoryId = dto.categoryId;
    if (dto.description) updateData.description = dto.description;
    if (dto.reference !== undefined) updateData.reference = dto.reference;
    if (dto.date) updateData.date = caracasDayStart(dto.date);
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // Recalcular montos/tasa si cambia alguno. Usa la tasa EDITADA o la que ya
    // tiene el gasto (nunca la de hoy), para respetar su tasa historica.
    const rateEdited = dto.exchangeRate !== undefined && dto.exchangeRate > 0;
    if (dto.amountUsd !== undefined || dto.amountBs !== undefined || rateEdited) {
      const effRate = rateEdited ? dto.exchangeRate! : expense.exchangeRate;
      let usd = expense.amountUsd;
      let bs = expense.amountBs;
      if (dto.amountUsd !== undefined && dto.amountBs !== undefined) {
        usd = dto.amountUsd;
        bs = dto.amountBs;
      } else if (dto.amountUsd !== undefined) {
        usd = dto.amountUsd;
        bs = Math.round(dto.amountUsd * effRate * 100) / 100;
      } else if (dto.amountBs !== undefined) {
        bs = dto.amountBs;
        usd = Math.round((dto.amountBs / effRate) * 100) / 100;
      } else {
        // solo cambio la tasa -> re-derivar Bs desde el USD ancla
        bs = Math.round(expense.amountUsd * effRate * 100) / 100;
      }
      updateData.amountUsd = usd;
      updateData.amountBs = bs;
      updateData.exchangeRate = effRate;
    }

    // Actualiza el gasto y, si tiene movimiento de caja vinculado, lo sincroniza
    // en la misma transaccion para que el arqueo/cierre no se descuadre.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: updateData,
        include: {
          category: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      });

      if (expense.cashMovement) {
        const mvData: any = {};
        if (updateData.amountUsd !== undefined) {
          mvData.amountUsd = updateData.amountUsd;
          mvData.amountBs = updateData.amountBs;
          mvData.exchangeRate = updateData.exchangeRate;
        }
        if (updateData.description !== undefined) {
          mvData.reason = `Gasto: ${updated.description}`;
        }
        if (Object.keys(mvData).length > 0) {
          await tx.cashMovement.update({ where: { id: expense.cashMovement.id }, data: mvData });
          // Sincronizar tambien la fila del libro mayor (tabla madre), para que no quede
          // con el monto/razon viejos al editar el gasto.
          await tx.cashLedgerEntry.updateMany({
            where: { sourceType: 'EXPENSE', sourceId: id },
            data: mvData,
          });
        }
      }

      return updated;
    });
  }

  async delete(id: string, user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN puede eliminar gastos');
    }
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { payable: { select: { id: true, paidAmountUsd: true } } },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');

    // Un gasto a credito con CxP asociada no se borra directo: primero hay que
    // gestionar la cuenta por pagar (evita dejar una CxP huerfana o borrar deuda pagada).
    if (expense.payable) {
      throw new BadRequestException(
        'Este gasto a credito tiene una cuenta por pagar asociada. Gestiona/anula la CxP antes de eliminar el gasto.',
      );
    }

    return this.prisma.expense.delete({ where: { id } });
  }
}
