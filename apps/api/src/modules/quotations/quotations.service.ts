import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UserRole } from '@prisma/client';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';

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
        where.createdAt.gte = caracasDayStart(filters.from);
      }
      if (filters.to) {
        where.createdAt.lte = caracasDayEnd(filters.to);
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
        seller: { select: { id: true, code: true, name: true, phone: true } },
      },
    });
    if (!quotation) throw new NotFoundException('Cotizacion no encontrada');
    return quotation;
  }

  private async getTodayRate() {
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    return rate?.rate || 0;
  }

  async create(dto: CreateQuotationDto, user: { id: string; role: UserRole }) {
    const config = await this.prisma.companyConfig.findFirst();
    const validityDays = config?.quotationValidityDays || 30;
    const exchangeRate = await this.getTodayRate();

    // Vendedor de la cotizacion: el pasado en el DTO, o el vinculado al usuario en sesion.
    const seller = dto.sellerId
      ? await this.prisma.seller.findUnique({ where: { id: dto.sellerId } })
      : await this.prisma.seller.findUnique({ where: { userId: user.id } });
    const sellerId = seller?.id || null;

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
      const discountMult = 1 - ((item.discountPct || 0) / 100);
      const lineSubtotal = baseUnitPrice * item.quantity * discountMult;
      const ivaAmount = lineSubtotal * ivaRate;
      const lineTotalUsd = lineSubtotal + ivaAmount;

      subtotalUsd += lineSubtotal;
      ivaBreakdown[product.ivaType] = (ivaBreakdown[product.ivaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        quantity: item.quantity,
        unitPriceUsd: baseUnitPrice,
        unitPriceBs: Math.round(baseUnitPrice * exchangeRate * 100) / 100,
        ivaType: product.ivaType,
        ivaAmount,
        ivaAmountBs: Math.round(ivaAmount * exchangeRate * 100) / 100,
        totalUsd: lineTotalUsd,
        totalBs: Math.round(lineTotalUsd * exchangeRate * 100) / 100,
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
          subtotalBs: Math.round(subtotalUsd * exchangeRate * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          ivaBs: Math.round(totalIva * exchangeRate * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          totalBs: Math.round(totalUsd * exchangeRate * 100) / 100,
          exchangeRate,
          notes: dto.notes,
          expiresAt,
          createdById: user.id,
          sellerId,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
          seller: { select: { id: true, code: true, name: true, phone: true } },
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

    const exchangeRate = await this.getTodayRate();

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
      const lineTotalUsd = lineSubtotal + ivaAmount;

      subtotalUsd += lineSubtotal;
      ivaBreakdown[product.ivaType] = (ivaBreakdown[product.ivaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        quantity: item.quantity,
        unitPriceUsd: baseUnitPrice,
        unitPriceBs: Math.round(baseUnitPrice * exchangeRate * 100) / 100,
        ivaType: product.ivaType,
        ivaAmount,
        ivaAmountBs: Math.round(ivaAmount * exchangeRate * 100) / 100,
        totalUsd: lineTotalUsd,
        totalBs: Math.round(lineTotalUsd * exchangeRate * 100) / 100,
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
          subtotalBs: Math.round(subtotalUsd * exchangeRate * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          ivaBs: Math.round(totalIva * exchangeRate * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          totalBs: Math.round(totalUsd * exchangeRate * 100) / 100,
          exchangeRate,
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
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException(
        'No hay tasa BCV registrada para hoy. Registra la tasa antes de facturar',
      );
    }

    // Determine cash register
    let cashRegisterId: string;
    const session = await this.prisma.cashSession.findFirst({
      where: { openedById: user.id, status: 'OPEN' },
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

    // La factura nace EN ESPERA (pre-factura): sin serie ni numero correlativo. La caja/serie
    // definitivas y el numero se asignan al COBRAR (igual que el POS: "number will be assigned at
    // payment time to avoid gaps"). Asi un vendedor/supervisor/administrador puede convertir la
    // cotizacion y dejarla en espera sin necesidad de tener una caja abierta con serie configurada.
    // Create invoice in transaction
    const invoice = await this.prisma.$transaction(async (tx) => {
      const config = await tx.companyConfig.findFirst();

      // Vendedor: el de la cotizacion (preserva la atribucion para comisiones); si la cotizacion no
      // tiene vendedor (cotizaciones viejas), cae al vendedor del usuario que convierte.
      const sellerId =
        quotation.sellerId ||
        (await tx.seller.findUnique({ where: { userId: user.id } }))?.id ||
        null;

      // Use existing config for brega
      const bregaGlobalPct = config?.bregaGlobalPct || 0;

      // Fetch products for cost calculation
      const productIds = quotation.items.map((i) => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const created = await tx.invoice.create({
        data: {
          number: null,
          cashRegisterId,
          customerId: quotation.customerId,
          status: 'PENDING',
          subtotalUsd: quotation.subtotalUsd,
          subtotalBs: Math.round(quotation.subtotalUsd * rate.rate * 100) / 100,
          ivaUsd: quotation.ivaUsd,
          ivaBs: Math.round(quotation.ivaUsd * rate.rate * 100) / 100,
          totalUsd: quotation.totalUsd,
          totalBs: Math.round(totalBs * 100) / 100,
          exchangeRate: rate.rate,
          notes: quotation.notes,
          createdById: user.id,
          sellerId,
          items: {
            create: quotation.items.map((item) => {
              const product = productMap.get(item.productId);
              const ivaRate = IVA_RATES[item.ivaType] || 0;
              const ivaMultiplier = 1 + ivaRate;
              const unitPriceWithoutIva = item.unitPriceUsd;
              const costUsd = product
                ? (product.bregaApplies ? product.costUsd * (1 + bregaGlobalPct / 100) : product.costUsd)
                : 0;
              return {
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                unitPrice: item.unitPriceUsd,
                ivaType: item.ivaType,
                ivaAmount: item.ivaAmount,
                totalUsd: item.totalUsd,
                unitPriceBs: Math.round(item.unitPriceUsd * rate.rate * 100) / 100,
                ivaAmountBs: Math.round(item.ivaAmount * rate.rate * 100) / 100,
                totalBs: Math.round(item.totalUsd * rate.rate * 100) / 100,
                unitPriceWithoutIva,
                unitPriceWithoutIvaBs: Math.round(unitPriceWithoutIva * rate.rate * 100) / 100,
                costUsd,
                costBs: Math.round(costUsd * rate.rate * 100) / 100,
              };
            }),
          },
        },
        include: {
          items: true,
          customer: true,
          seller: { select: { id: true, code: true, name: true } },
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

  // Elimina (hard-delete) las pre-facturas PENDING de dias anteriores que nunca se
  // cobraron. El filtro status='PENDING' garantiza que NUNCA toca facturas pagadas
  // (una pagada nunca esta PENDING); ademas estas pre-facturas tienen number=null,
  // no mueven stock ni generan CxC, asi que borrarlas no deja huecos ni descuadres.
  // Se borran items + pagos + factura en transaccion (igual que el delete manual).
  async deleteOldPendingInvoices() {
    const today = caracasDayStart();

    const stale = await this.prisma.invoice.findMany({
      where: { status: 'PENDING', createdAt: { lt: today } },
      select: { id: true },
    });
    if (stale.length === 0) return 0;
    const ids = stale.map((i) => i.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
      await tx.payment.deleteMany({ where: { invoiceId: { in: ids } } });
      await tx.invoice.deleteMany({ where: { id: { in: ids }, status: 'PENDING' } });
    });

    return ids.length;
  }
}
