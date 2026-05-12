import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { UserRole, PaymentMethod } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const LOCK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

const IGTF_METHODS: string[] = ['CASH_USD', 'ZELLE'];

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    status?: string;
    customerId?: string;
    cashRegisterId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.cashRegisterId) where.cashRegisterId = filters.cashRegisterId;

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        fromDate.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = fromDate;
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        toDate.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = toDate;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, rif: true } },
          cashRegister: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findPending(todayOnly = false) {
    const where: any = { status: { in: ['PENDING', 'DRAFT'] } };

    if (todayOnly) {
      const now = new Date();
      const startOfDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true } },
        items: {
          take: 3,
          select: { id: true, productName: true, quantity: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Add item count for summary
    const invoiceIds = invoices.map((i) => i.id);
    const itemCounts = await this.prisma.invoiceItem.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds } },
      _count: true,
    });
    const countMap = new Map(itemCounts.map((c) => [c.invoiceId, c._count]));

    // Get locker names
    const lockerIds = invoices.filter((i) => i.lockedById).map((i) => i.lockedById!);
    const lockers = lockerIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: lockerIds } }, select: { id: true, name: true } })
      : [];
    const lockerMap = new Map(lockers.map((u) => [u.id, u.name]));

    const now = Date.now();
    return invoices.map((inv) => {
      // Auto-expire locks older than 10 minutes
      const lockExpired = inv.lockedAt && (now - inv.lockedAt.getTime() > LOCK_EXPIRY_MS);
      const isLocked = inv.lockedById && !lockExpired;

      return {
        ...inv,
        totalItems: countMap.get(inv.id) || 0,
        lockedById: isLocked ? inv.lockedById : null,
        lockedAt: isLocked ? inv.lockedAt : null,
        lockedByName: isLocked ? lockerMap.get(inv.lockedById!) || null : null,
      };
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        cashRegister: true,
        items: true,
        payments: true,
        receivables: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async create(
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
  ) {
    // Get today's exchange rate
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException(
        'No hay tasa BCV registrada para hoy. Registra la tasa antes de facturar',
      );
    }

    // Determine cash register
    let cashRegisterId = dto.cashRegisterId;
    if (!cashRegisterId) {
      const session = await this.prisma.cashSession.findFirst({
        where: { openedById: user.id, status: 'OPEN' },
      });
      if (session) {
        cashRegisterId = session.cashRegisterId;
      } else {
        // Use first active register for sellers creating pre-invoices
        const defaultRegister = await this.prisma.cashRegister.findFirst({
          where: { isActive: true },
        });
        if (!defaultRegister) {
          throw new BadRequestException('No hay cajas registradoras disponibles');
        }
        cashRegisterId = defaultRegister.id;
      }
    }

    // Fetch products and calculate totals
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalUsd = 0;
    const ivaBreakdown: Record<string, number> = {};
    const itemsData: any[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Producto ${item.productId} no encontrado`);

      // priceDetal already includes IVA — extract base price
      const priceWithIva = item.unitPrice ?? product.priceDetal;
      const ivaRate = IVA_RATES[product.ivaType] || 0;
      const baseUnitPrice = priceWithIva / (1 + ivaRate);
      const lineSubtotal = baseUnitPrice * item.quantity;
      const ivaAmount = lineSubtotal * ivaRate;

      subtotalUsd += lineSubtotal;
      ivaBreakdown[product.ivaType] = (ivaBreakdown[product.ivaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: baseUnitPrice,
        ivaType: product.ivaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
        unitPriceBs: Math.round(baseUnitPrice * rate.rate * 100) / 100,
        ivaAmountBs: Math.round(ivaAmount * rate.rate * 100) / 100,
        totalBs: Math.round((lineSubtotal + ivaAmount) * rate.rate * 100) / 100,
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;
    const totalBs = totalUsd * rate.rate;

    // Determine status based on role
    const isSeller = user.role === 'SELLER';
    const status = isSeller ? 'PENDING' : 'DRAFT';

    // Generate invoice number with SELECT FOR UPDATE
    const invoice = await this.prisma.$transaction(async (tx) => {
      // Lock the cash register row for correlative increment
      const registers = await tx.$queryRaw<any[]>`
        SELECT "lastInvoiceNumber", "code" FROM "CashRegister"
        WHERE id = ${cashRegisterId} FOR UPDATE
      `;
      const reg = registers[0];
      const nextNumber = reg.lastInvoiceNumber + 1;

      await tx.cashRegister.update({
        where: { id: cashRegisterId },
        data: { lastInvoiceNumber: nextNumber },
      });

      const config = await tx.companyConfig.findFirst();
      const prefix = config?.invoicePrefix || 'FAC';
      const year = new Date().getFullYear().toString().slice(-2);
      const correlativo = nextNumber.toString().padStart(8, '0');
      const invoiceNumber = `${prefix}-${reg.code}-${year}-${correlativo}`;

      return tx.invoice.create({
        data: {
          number: invoiceNumber,
          cashRegisterId,
          customerId: dto.customerId || null,
          status,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          totalBs: Math.round(totalBs * 100) / 100,
          subtotalBs: Math.round(subtotalUsd * rate.rate * 100) / 100,
          ivaBs: Math.round(totalIva * rate.rate * 100) / 100,
          exchangeRate: rate.rate,
          notes: dto.notes,
          createdById: user.id,
          sellerId: isSeller ? user.id : null,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
          cashRegister: { select: { id: true, code: true, name: true } },
        },
      });
    });

    return invoice;
  }

  async pay(
    id: string,
    dto: PayInvoiceDto,
    user: { id: string; role: UserRole },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!['DRAFT', 'PENDING'].includes(invoice.status)) {
      throw new BadRequestException('Solo se pueden cobrar facturas en estado DRAFT o PENDING');
    }

    // Validate payment total
    const totalPaidUsd = dto.payments.reduce((s, p) => s + p.amountUsd, 0);

    if (!dto.isCredit && totalPaidUsd < invoice.totalUsd - 0.01) {
      throw new BadRequestException(
        `El monto pagado ($${totalPaidUsd.toFixed(2)}) es menor al total ($${invoice.totalUsd.toFixed(2)})`,
      );
    }

    // Credit validation
    if (dto.isCredit) {
      const config = await this.prisma.companyConfig.findFirst();
      if (!config?.creditAuthPassword) {
        throw new BadRequestException('No hay clave de autorización de crédito configurada');
      }
      if (!dto.creditAuthPassword) {
        throw new BadRequestException('Se requiere la clave de autorización para crédito');
      }
      const isValid = await bcrypt.compare(dto.creditAuthPassword, config.creditAuthPassword);
      if (!isValid) {
        throw new ForbiddenException('Clave de autorización incorrecta');
      }

      // Check customer credit limit
      if (invoice.customer) {
        const pendingReceivables = await this.prisma.receivable.aggregate({
          where: {
            customerId: invoice.customerId,
            status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          },
          _sum: { amountUsd: true },
        });
        const currentDebt = pendingReceivables._sum.amountUsd || 0;
        const availableCredit = invoice.customer.creditLimit - currentDebt;
        if (invoice.totalUsd > availableCredit + 0.01) {
          throw new BadRequestException(
            `Crédito insuficiente. Disponible: $${availableCredit.toFixed(2)}, Requerido: $${invoice.totalUsd.toFixed(2)}`,
          );
        }
      }
    }

    // Get default warehouse and IGTF config
    const config = await this.prisma.companyConfig.findFirst();
    let warehouseId = config?.defaultWarehouseId;
    if (!warehouseId) {
      const defaultWh = await this.prisma.warehouse.findFirst({
        where: { isDefault: true },
      });
      if (!defaultWh) {
        const anyWh = await this.prisma.warehouse.findFirst({ where: { isActive: true } });
        if (!anyWh) throw new BadRequestException('No hay almacén configurado');
        warehouseId = anyWh.id;
      } else {
        warehouseId = defaultWh.id;
      }
    }

    // IGTF calculation
    const isIGTFContributor = config?.isIGTFContributor || false;
    const igtfPct = config?.igtfPct || 3;
    let invoiceIgtfUsd = 0;
    let invoiceIgtfBs = 0;

    if (isIGTFContributor && invoice.igtfUsd === 0) {
      const foreignTotal = dto.payments
        .filter(p => IGTF_METHODS.includes(p.method))
        .reduce((sum, p) => sum + p.amountUsd, 0);

      if (foreignTotal > 0) {
        invoiceIgtfUsd = Math.round(foreignTotal * (igtfPct / 100) * 100) / 100;
        invoiceIgtfBs = Math.round(invoiceIgtfUsd * invoice.exchangeRate * 100) / 100;
      }
    }

    const newTotalUsd = invoiceIgtfUsd > 0
      ? Math.round((invoice.totalUsd + invoiceIgtfUsd) * 100) / 100
      : invoice.totalUsd;
    const newTotalBs = invoiceIgtfUsd > 0
      ? Math.round((invoice.totalBs + invoiceIgtfBs) * 100) / 100
      : invoice.totalBs;

    // Execute everything in transaction
    let igtfAlreadyCalculated = invoice.igtfUsd > 0;

    const result = await this.prisma.$transaction(async (tx) => {
      // Create payments
      for (const payment of dto.payments) {
        let paymentIgtfUsd = 0;
        let paymentIgtfBs = 0;

        if (!igtfAlreadyCalculated && isIGTFContributor && IGTF_METHODS.includes(payment.method)) {
          paymentIgtfUsd = Math.round(payment.amountUsd * (igtfPct / 100) * 100) / 100;
          paymentIgtfBs = Math.round(paymentIgtfUsd * invoice.exchangeRate * 100) / 100;
          igtfAlreadyCalculated = true;
        }

        await tx.payment.create({
          data: {
            invoiceId: id,
            method: payment.method,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: invoice.exchangeRate,
            reference: payment.reference,
            igtfUsd: paymentIgtfUsd,
            igtfBs: paymentIgtfBs,
          },
        });

        // Create Receivable for Cashea/Crediagro
        if (payment.method === 'CASHEA' || payment.method === 'CREDIAGRO') {
          await tx.receivable.create({
            data: {
              type: 'FINANCING_PLATFORM',
              platformName: payment.method === 'CASHEA' ? 'Cashea' : 'Crediagro',
              invoiceId: id,
              amountUsd: payment.amountUsd,
              amountBs: payment.amountBs,
              exchangeRate: invoice.exchangeRate,
            },
          });
        }
      }

      // Create credit receivable (uses totals with IGTF included)
      if (dto.isCredit && invoice.customerId) {
        const creditDays = dto.creditDays || invoice.customer?.creditDays || 30;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + creditDays);

        await tx.receivable.create({
          data: {
            type: 'CUSTOMER_CREDIT',
            customerId: invoice.customerId,
            invoiceId: id,
            amountUsd: newTotalUsd,
            amountBs: newTotalBs,
            exchangeRate: invoice.exchangeRate,
            dueDate,
          },
        });
      }

      // Deduct stock and create movements
      for (const item of invoice.items) {
        await tx.stock.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: warehouseId!,
            },
          },
          create: {
            productId: item.productId,
            warehouseId: warehouseId!,
            quantity: -item.quantity,
          },
          update: {
            quantity: { decrement: item.quantity },
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: warehouseId!,
            type: 'SALE',
            quantity: -item.quantity,
            reason: `Venta factura ${invoice.number}`,
            reference: invoice.number,
            createdById: user.id,
          },
        });
      }

      // Update invoice status, IGTF, and release lock
      const newStatus = dto.isCredit ? 'CREDIT' : 'PAID';
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status: newStatus,
          isCredit: dto.isCredit || false,
          creditDays: dto.creditDays || 0,
          dueDate: dto.isCredit
            ? new Date(Date.now() + (dto.creditDays || 30) * 86400000)
            : null,
          paidAt: new Date(),
          lockedById: null,
          lockedAt: null,
          igtfUsd: invoiceIgtfUsd,
          igtfBs: invoiceIgtfBs,
          totalUsd: newTotalUsd,
          totalBs: newTotalBs,
        },
        include: {
          items: true,
          payments: true,
          customer: true,
          receivables: true,
        },
      });

      // Create PrintJobs grouped by print area
      const productsWithCategory = await tx.product.findMany({
        where: { id: { in: invoice.items.map(i => i.productId) } },
        include: { category: { include: { printArea: true } } },
      });
      const productMap = new Map(productsWithCategory.map(p => [p.id, p]));

      const printAreaGroups: Record<string, { printAreaId: string; items: any[] }> = {};
      for (const item of invoice.items) {
        const product = productMap.get(item.productId);
        const printAreaId = product?.category?.printAreaId;
        if (!printAreaId) continue;

        if (!printAreaGroups[printAreaId]) {
          printAreaGroups[printAreaId] = { printAreaId, items: [] };
        }
        printAreaGroups[printAreaId].items.push({
          code: product!.code,
          supplierRef: product!.supplierRef || '',
          name: item.productName,
          quantity: item.quantity,
        });
      }

      for (const group of Object.values(printAreaGroups)) {
        await tx.printJob.create({
          data: {
            invoiceId: id,
            printAreaId: group.printAreaId,
            items: group.items,
          },
        });
      }

      return updatedInvoice;
    });

    return result;
  }

  async retake(id: string, user: { id: string; role: UserRole }) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!['PENDING', 'DRAFT'].includes(invoice.status)) {
      throw new BadRequestException('Solo se pueden retomar facturas en espera');
    }

    // Check if locked by someone else (and not expired)
    if (invoice.lockedById && invoice.lockedById !== user.id) {
      const lockAge = Date.now() - (invoice.lockedAt?.getTime() || 0);
      if (lockAge < LOCK_EXPIRY_MS) {
        const locker = await this.prisma.user.findUnique({
          where: { id: invoice.lockedById },
          select: { name: true },
        });
        throw new ConflictException(
          `Esta factura está siendo editada por ${locker?.name || 'otro usuario'}`,
        );
      }
    }

    // Lock it
    await this.prisma.invoice.update({
      where: { id },
      data: { lockedById: user.id, lockedAt: new Date() },
    });

    return invoice;
  }

  async updateItems(
    id: string,
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!['PENDING', 'DRAFT'].includes(invoice.status)) {
      throw new BadRequestException('Solo se pueden editar facturas en espera');
    }

    // Get today's exchange rate
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException('No hay tasa BCV registrada para hoy');
    }

    // Fetch products and calculate totals
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalUsd = 0;
    const ivaBreakdown: Record<string, number> = {};
    const itemsData: any[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Producto ${item.productId} no encontrado`);

      // priceDetal already includes IVA — extract base price
      const priceWithIva = item.unitPrice ?? product.priceDetal;
      const ivaRate = IVA_RATES[product.ivaType] || 0;
      const baseUnitPrice = priceWithIva / (1 + ivaRate);
      const lineSubtotal = baseUnitPrice * item.quantity;
      const ivaAmount = lineSubtotal * ivaRate;

      subtotalUsd += lineSubtotal;
      ivaBreakdown[product.ivaType] = (ivaBreakdown[product.ivaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: baseUnitPrice,
        ivaType: product.ivaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
        unitPriceBs: Math.round(baseUnitPrice * rate.rate * 100) / 100,
        ivaAmountBs: Math.round(ivaAmount * rate.rate * 100) / 100,
        totalBs: Math.round((lineSubtotal + ivaAmount) * rate.rate * 100) / 100,
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;
    const totalBs = totalUsd * rate.rate;

    // Update in transaction: delete old items, create new, update totals, release lock
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      return tx.invoice.update({
        where: { id },
        data: {
          customerId: dto.customerId || null,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          totalBs: Math.round(totalBs * 100) / 100,
          subtotalBs: Math.round(subtotalUsd * rate.rate * 100) / 100,
          ivaBs: Math.round(totalIva * rate.rate * 100) / 100,
          exchangeRate: rate.rate,
          notes: dto.notes,
          lockedById: null,
          lockedAt: null,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
          cashRegister: { select: { id: true, code: true, name: true } },
        },
      });
    });

    return updated;
  }

  async updateControlNumber(
    id: string,
    controlNumber: string,
    user: { id: string; role: UserRole },
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede actualizar el numero de control');
    }
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    return this.prisma.invoice.update({
      where: { id },
      data: { controlNumber },
    });
  }

  // TODO: Las facturas PAID/CREDIT no deben cancelarse directamente.
  // En el futuro se manejarán con Notas de Crédito que reviertan stock,
  // movimientos de inventario y receivables asociados.
  async cancel(id: string, user: { id: string; role: UserRole }) {
    if (!['ADMIN', 'SUPERVISOR'].includes(user.role)) {
      throw new ForbiddenException('Solo ADMIN o SUPERVISOR pueden cancelar facturas');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (['PAID', 'CREDIT'].includes(invoice.status)) {
      throw new BadRequestException(
        'Las facturas pagadas no pueden cancelarse. Emite una nota de credito.',
      );
    }

    if (!['PENDING', 'DRAFT'].includes(invoice.status)) {
      throw new BadRequestException('Solo se pueden cancelar facturas en espera');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED', lockedById: null, lockedAt: null },
    });
  }

  async delete(id: string, user: { id: string; role: UserRole }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (!['PENDING', 'DRAFT'].includes(invoice.status)) {
      throw new BadRequestException('Solo se pueden eliminar facturas en espera');
    }

    // Hard delete: items, payments, receivables cascade via Prisma schema
    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.payment.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id } });
    });

    return { deleted: true };
  }
}
