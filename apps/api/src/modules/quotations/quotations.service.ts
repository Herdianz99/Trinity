import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UserRole } from '@prisma/client';

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

@Injectable()
export class QuotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    status?: string;
    customerId?: string;
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
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, rif: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        items: true,
      },
    });
    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');
    return quotation;
  }

  async create(dto: CreateQuotationDto, user: { id: string; role: UserRole }) {
    const config = await this.prisma.companyConfig.findFirst();
    const validityDays = config?.quotationValidityDays || 30;

    // Fetch products
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

      // priceDetal includes IVA — extract base price
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
        productCode: product.code,
        quantity: item.quantity,
        unitPriceUsd: baseUnitPrice,
        ivaType: product.ivaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    // Generate number with SELECT FOR UPDATE on a counter approach
    const quotation = await this.prisma.$transaction(async (tx) => {
      // Get next number atomically
      const result = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "Quotation"
      `;
      const nextNumber = Number(result[0].count) + 1;
      const number = `COT-${nextNumber.toString().padStart(4, '0')}`;

      return tx.quotation.create({
        data: {
          number,
          customerId: dto.customerId || null,
          status: 'DRAFT',
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          notes: dto.notes,
          expiresAt,
          createdById: user.id,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
        },
      });
    });

    return quotation;
  }

  async update(id: string, dto: CreateQuotationDto, user: { id: string; role: UserRole }) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');
    if (quotation.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden editar cotizaciones en borrador');
    }

    // Fetch products
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
        productCode: product.code,
        quantity: item.quantity,
        unitPriceUsd: baseUnitPrice,
        ivaType: product.ivaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      return tx.quotation.update({
        where: { id },
        data: {
          customerId: dto.customerId || null,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          notes: dto.notes,
          items: { create: itemsData },
        },
        include: { items: true, customer: true },
      });
    });

    return updated;
  }

  async changeStatus(id: string, status: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');

    const validTransitions: Record<string, string[]> = {
      DRAFT: ['SENT', 'APPROVED', 'REJECTED'],
      SENT: ['APPROVED', 'REJECTED'],
      APPROVED: ['REJECTED'],
    };

    const allowed = validTransitions[quotation.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `No se puede cambiar de ${quotation.status} a ${status}`,
      );
    }

    return this.prisma.quotation.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async convertToInvoice(id: string, user: { id: string; role: UserRole }) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');

    if (!['DRAFT', 'APPROVED'].includes(quotation.status)) {
      throw new BadRequestException('Solo se pueden convertir cotizaciones en borrador o aprobadas');
    }

    if (quotation.status === 'EXPIRED') {
      throw new BadRequestException('La cotizacion ha expirado');
    }

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
    let cashRegisterId: string;
    const session = await this.prisma.cashSession.findFirst({
      where: { userId: user.id, status: 'OPEN' },
    });
    if (session) {
      cashRegisterId = session.cashRegisterId;
    } else {
      const defaultRegister = await this.prisma.cashRegister.findFirst({
        where: { isActive: true },
      });
      if (!defaultRegister) {
        throw new BadRequestException('No hay cajas registradoras disponibles');
      }
      cashRegisterId = defaultRegister.id;
    }

    const totalBs = quotation.totalUsd * rate.rate;

    // Create invoice in transaction
    const invoice = await this.prisma.$transaction(async (tx) => {
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

      const isSeller = user.role === 'SELLER';

      const created = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          cashRegisterId,
          customerId: quotation.customerId,
          status: isSeller ? 'PENDING' : 'DRAFT',
          subtotalUsd: quotation.subtotalUsd,
          ivaUsd: quotation.ivaUsd,
          totalUsd: quotation.totalUsd,
          totalBs: Math.round(totalBs * 100) / 100,
          exchangeRate: rate.rate,
          notes: quotation.notes,
          createdById: user.id,
          sellerId: isSeller ? user.id : null,
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPriceUsd,
              ivaType: item.ivaType,
              ivaAmount: item.ivaAmount,
              totalUsd: item.totalUsd,
            })),
          },
        },
        include: {
          items: true,
          customer: true,
          cashRegister: { select: { id: true, code: true, name: true } },
        },
      });

      // Update quotation
      await tx.quotation.update({
        where: { id },
        data: {
          status: 'APPROVED',
          convertedToInvoiceId: created.id,
        },
      });

      return created;
    });

    return invoice;
  }

  async expireOldQuotations() {
    const now = new Date();
    const result = await this.prisma.quotation.updateMany({
      where: {
        status: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] },
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async cancelOldPendingInvoices() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.invoice.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: today },
      },
      data: { status: 'CANCELLED' },
    });
    return result.count;
  }
}
