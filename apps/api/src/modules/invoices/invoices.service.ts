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
import { UserRole } from '@prisma/client';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { buildPrintAreaGroups } from '../print-jobs/print-area-grouping';

const LOCK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const IVA_RATES: Record<string, number> = {
  EXEMPT: 0,
  REDUCED: 0.08,
  GENERAL: 0.16,
  SPECIAL: 0.31,
};

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    status?: string;
    paymentType?: string;
    customerId?: string;
    sellerId?: string;
    cashRegisterId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    fiscalPrinted?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const where: any = {};

    if (filters.status) where.status = filters.status;
    if (filters.paymentType) where.paymentType = filters.paymentType;
    if (filters.fiscalPrinted === 'true') where.fiscalPrinted = true;
    if (filters.fiscalPrinted === 'false') where.fiscalPrinted = false;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.sellerId) where.sellerId = filters.sellerId;
    if (filters.cashRegisterId) where.cashRegisterId = filters.cashRegisterId;

    // Unified search: invoice number, customer name, or customer rif
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { rif: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

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
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, rif: true } },
          seller: { select: { id: true, code: true, name: true } },
          cashRegister: { select: { id: true, code: true, name: true } },
          serie: { select: { id: true, name: true, prefix: true, isFiscal: true, comPort: true } },
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

  /**
   * Suma la cantidad comprometida por producto en TODAS las facturas en espera
   * (status PENDING, de cualquier dia/vendedor/caja). El stock solo se descuenta al
   * pagar, asi que estos items aun figuran en el stock real; el POS resta este mapa
   * para mostrar el "Disponible". Devuelve { [productId]: cantidadReservada }.
   */
  async getReservedStock(): Promise<Record<string, number>> {
    const grouped = await this.prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: { invoice: { status: 'PENDING' } },
      _sum: { quantity: true },
    });
    const map: Record<string, number> = {};
    for (const g of grouped) {
      const qty = g._sum.quantity || 0;
      if (qty > 0) map[g.productId] = qty;
    }
    return map;
  }

  async findPending(todayOnly = false) {
    const where: any = { status: 'PENDING' };

    if (todayOnly) {
      // "Hoy" segun la zona horaria de Venezuela (America/Caracas, UTC-4), NO la del
      // servidor ni un rango UTC-naive: una factura aparcada de noche en Caracas cae
      // en el dia UTC siguiente, y con el rango viejo desaparecia de "facturas en espera".
      const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const startOfDay = new Date(`${ymd}T00:00:00.000-04:00`);
      const endOfDay = new Date(`${ymd}T23:59:59.999-04:00`);
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, documentType: true, rif: true } },
        seller: { select: { id: true, code: true, name: true } },
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
        serie: { select: { id: true, name: true, prefix: true, isFiscal: true, comPort: true } },
        items: true,
        payments: { include: { method: true, changeMethod: true } },
        receivables: {
          include: {
            payments: {
              orderBy: { createdAt: 'desc' },
              include: {
                method: true,
                receipt: { select: { id: true, number: true } },
              },
            },
          },
        },
        seller: { select: { id: true, code: true, name: true } },
        cashier: { select: { id: true, name: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    // Enrich items with product codes for fiscal reprint
    const productIds = invoice.items.map(i => i.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, code: true, priceDetal: true },
        })
      : [];
    const codeMap = new Map(products.map(p => [p.id, p.code]));
    const priceMap = new Map(products.map(p => [p.id, p.priceDetal]));

    return {
      ...invoice,
      items: invoice.items.map(item => ({
        ...item,
        productCode: codeMap.get(item.productId) || null,
        priceDetal: priceMap.get(item.productId) ?? null,
      })),
      receivables: invoice.receivables.map(r => ({
        ...r,
        balanceUsd: r.amountUsd - r.paidAmountUsd,
      })),
    };
  }

  async create(
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
  ) {
    // Get today's exchange rate
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException(
        'No hay tasa BCV registrada para hoy. Registra la tasa antes de facturar',
      );
    }

    // Get company config for brega calculation
    const config = await this.prisma.companyConfig.findFirst();
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    // Auto-assign default customer if none provided
    let customerId = dto.customerId || null;
    if (!customerId && config?.defaultCustomerId) {
      customerId = config.defaultCustomerId;
    }

    // Validate customer exists
    if (customerId) {
      const customerExists = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customerExists) {
        throw new BadRequestException(
          `Cliente con ID ${customerId} no existe. Verifique que el cliente no haya sido eliminado.`,
        );
      }
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

    // Determine seller: from dto, from user's linked seller, or null
    let sellerId: string | null = dto.sellerId || null;
    if (!sellerId) {
      const userSeller = await this.prisma.seller.findUnique({
        where: { userId: user.id },
      });
      if (userSeller) {
        sellerId = userSeller.id;
      }
    }

    // Fetch products and calculate totals
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalUsd = 0;
    let subtotalBsAccum = 0;
    let ivaBsAccum = 0;
    const ivaBreakdown: Record<string, number> = {};
    const itemsData: any[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Producto ${item.productId} no encontrado`);

      // priceDetal already includes IVA — extract base price using original product rate
      const priceWithIva = item.unitPrice ?? product.priceDetal;
      const originalIvaRate = IVA_RATES[product.ivaType] || 0;
      // At pre-invoice creation, use the product's original IVA type
      // VAT exemption will be applied at payment time based on the cashier's serie
      const effectiveIvaType = product.ivaType;
      const ivaRate = IVA_RATES[effectiveIvaType] || 0;
      const ivaMultiplier = 1 + originalIvaRate;
      const baseUnitPrice = priceWithIva / ivaMultiplier;

      // Apply line discount
      const discountPct = item.discountPct || 0;
      const discountMultiplier = 1 - discountPct / 100;
      const discountedBasePrice = baseUnitPrice * discountMultiplier;
      const lineSubtotal = discountedBasePrice * item.quantity;
      const ivaAmount = lineSubtotal * ivaRate;

      // Bs driven: calculate from Bs subtotal to match fiscal printer
      const lineSubtotalBs = Math.round(lineSubtotal * rate.rate * 100) / 100;
      const lineIvaBs = Math.round(lineSubtotalBs * ivaRate * 100) / 100;
      const lineTotalBs = Math.round((lineSubtotalBs + lineIvaBs) * 100) / 100;

      // unitPriceWithoutIva = base price WITHOUT discount (for reference)
      const unitPriceWithoutIva = priceWithIva / ivaMultiplier;
      const unitPriceWithoutIvaBs = Math.round(unitPriceWithoutIva * rate.rate * 100) / 100;

      // costUsd: if bregaApplies, apply brega; otherwise use raw cost
      const costUsd = product.bregaApplies
        ? product.costUsd * (1 + bregaGlobalPct / 100)
        : product.costUsd;
      const costBs = Math.round(costUsd * rate.rate * 100) / 100;

      subtotalUsd += lineSubtotal;
      subtotalBsAccum += lineSubtotalBs;
      ivaBsAccum += lineIvaBs;
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
        ivaAmountBs: lineIvaBs,
        totalBs: lineTotalBs,
        unitPriceWithoutIva,
        unitPriceWithoutIvaBs,
        discountPct,
        costUsd,
        costBs,
        priceOverridden: item.priceOverridden || (item.unitPrice != null && Math.abs(item.unitPrice - product.priceDetal) > 0.001),
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;

    // All invoices start as PENDING without correlative number
    // Number will be assigned at payment time to avoid gaps
    const invoice = await this.prisma.invoice.create({
      data: {
        number: null,
        cashRegisterId,
        customerId,
        status: 'PENDING',
        subtotalUsd: Math.round(subtotalUsd * 100) / 100,
        ivaUsd: Math.round(totalIva * 100) / 100,
        totalUsd: Math.round(totalUsd * 100) / 100,
        subtotalBs: Math.round(subtotalBsAccum * 100) / 100,
        ivaBs: Math.round(ivaBsAccum * 100) / 100,
        totalBs: Math.round((subtotalBsAccum + ivaBsAccum) * 100) / 100,
        exchangeRate: rate.rate,
        notes: dto.notes,
        createdById: user.id,
        sellerId,
        items: { create: itemsData },
      },
      include: {
        items: true,
        customer: true,
        seller: { select: { id: true, code: true, name: true } },
        cashRegister: { select: { id: true, code: true, name: true } },
      },
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
      include: { items: true, customer: true, cashRegister: true, serie: true },
    });

    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden cobrar facturas en estado PENDING');
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

    // Fetch payment method records for all methodIds in dto
    const methodIds = dto.payments.map(p => p.methodId);
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { id: { in: methodIds } },
    });
    const methodMap = new Map(paymentMethods.map(m => [m.id, m]));

    // Validate all methodIds exist
    for (const p of dto.payments) {
      if (!methodMap.has(p.methodId)) {
        throw new BadRequestException(`Metodo de pago con id "${p.methodId}" no encontrado`);
      }
    }

    // Stock validation: if allowNegativeStock is false, check stock before proceeding.
    // Excepcion: si el POS marca negativeStockAuthorized, un supervisor ya autorizo la
    // venta en negativo con su clave dinamica (SELL_NEGATIVE_STOCK) al agregar el producto.
    if (config && config.allowNegativeStock === false && !dto.negativeStockAuthorized) {
      const productIds = invoice.items.map(i => i.productId);
      const stocks = await this.prisma.stock.findMany({
        where: { productId: { in: productIds }, warehouseId: warehouseId! },
        include: { product: { select: { name: true, saleUnit: true } } },
      });
      const stockMap = new Map(stocks.map(s => [s.productId, s]));

      // Los servicios (flete, mano de obra...) no manejan inventario: se excluyen del
      // chequeo de stock, para que un vendedor pueda facturarlos sin autorizacion.
      const serviceProducts = await this.prisma.product.findMany({
        where: { id: { in: productIds }, isService: true },
        select: { id: true },
      });
      const serviceIds = new Set(serviceProducts.map(p => p.id));

      const insufficientItems: string[] = [];
      for (const item of invoice.items) {
        if (serviceIds.has(item.productId)) continue;
        const stockRecord = stockMap.get(item.productId);
        const available = stockRecord?.quantity ?? 0;
        if (available < item.quantity) {
          const name = stockRecord?.product?.name || item.productName;
          const unit = stockRecord?.product?.saleUnit || 'und';
          insufficientItems.push(`Stock insuficiente para '${name}'. Stock disponible: ${available} ${unit}`);
        }
      }

      if (insufficientItems.length > 0) {
        throw new BadRequestException(insufficientItems.join('. '));
      }
    }

    // Resolve cash register at payment time. Priority:
    //   1. dto.cashRegisterId — the register the cashier is standing at (sent by POS).
    //      This is what matters: a seller may have parked the invoice with an arbitrary
    //      register, and the cashier can have several registers open at once.
    //   2. invoice.cashRegisterId — fallback to whatever was set at creation.
    //   3. cashier's only open session — last resort for direct API calls.
    let serieCashRegisterId: string = dto.cashRegisterId || invoice.cashRegisterId;
    if (!serieCashRegisterId) {
      const cashierSession = await this.prisma.cashSession.findFirst({
        where: { openedById: user.id, status: 'OPEN' },
      });
      if (!cashierSession) {
        throw new BadRequestException('No hay caja asignada a esta factura ni sesión de caja abierta');
      }
      serieCashRegisterId = cashierSession.cashRegisterId;
    }

    // The register where we cobramos must have an OPEN session, otherwise the sale
    // would not land in any cash count (arqueo). Shared registers may be opened by
    // another user; non-shared registers must be opened by this cashier.
    const register = await this.prisma.cashRegister.findUnique({
      where: { id: serieCashRegisterId },
    });
    if (!register) {
      throw new BadRequestException('La caja indicada no existe');
    }
    const openSession = await this.prisma.cashSession.findFirst({
      where: {
        cashRegisterId: serieCashRegisterId,
        status: 'OPEN',
        ...(register.isShared ? {} : { openedById: user.id }),
      },
    });
    if (!openSession) {
      throw new BadRequestException(
        `Debes tener una caja abierta para cobrar (caja "${register.name}" sin sesión abierta)`,
      );
    }

    const paymentSerie = await this.prisma.serie.findUnique({
      where: { cashRegisterId: serieCashRegisterId },
    });
    if (!paymentSerie) {
      throw new BadRequestException(`La caja "${register.name}" no tiene serie configurada`);
    }
    if (!paymentSerie.isActive) {
      throw new BadRequestException('La serie de la caja del cajero está desactivada');
    }

    // If payment serie is VAT exempt, calculate effective totals without IVA
    let effectiveTotalUsd = invoice.totalUsd;
    let effectiveTotalBs = invoice.totalBs;
    let effectiveSubtotalUsd = invoice.subtotalUsd;
    let effectiveSubtotalBs = invoice.subtotalBs;
    if (paymentSerie.isVatExempt) {
      // Recalculate: sum base prices only (no IVA)
      let subtotalUsd = 0;
      let subtotalBsAccum = 0;
      for (const item of invoice.items) {
        // Aplicar el descuento de linea (item.unitPrice es el precio base SIN descuento)
        const discountMultiplier = 1 - (item.discountPct || 0) / 100;
        const lineSubtotal = item.unitPrice * item.quantity * discountMultiplier;
        const lineSubtotalBs = Math.round(lineSubtotal * invoice.exchangeRate * 100) / 100;
        subtotalUsd += lineSubtotal;
        subtotalBsAccum += lineSubtotalBs;
      }
      effectiveSubtotalUsd = Math.round(subtotalUsd * 100) / 100;
      effectiveSubtotalBs = Math.round(subtotalBsAccum * 100) / 100;
      effectiveTotalUsd = effectiveSubtotalUsd;
      effectiveTotalBs = effectiveSubtotalBs;
    }

    // Red de seguridad: descartar pagos en cero (amountUsd y amountBs ambos <= 0).
    // El POS pre-llena un metodo recien agregado con el restante; si el total ya
    // estaba cubierto, ese metodo entra en $0 y se persistiria como "pago fantasma"
    // que infla los reportes por metodo de pago. Ninguna ruta debe guardarlos.
    dto.payments = dto.payments.filter((p) => p.amountUsd > 0 || p.amountBs > 0);

    // Validate payment total (using effective totals that account for VAT exemption)
    const totalPaidUsd = dto.payments.reduce((s, p) => s + p.amountUsd, 0);

    if (!dto.isCredit && totalPaidUsd < effectiveTotalUsd - 0.01) {
      throw new BadRequestException(
        `El monto pagado ($${totalPaidUsd.toFixed(2)}) es menor al total ($${effectiveTotalUsd.toFixed(2)})`,
      );
    }

    // Credit validation — BLINDAJE (backend-enforced): el credito viene pre-aprobado en el
    // cliente (cupo/dias). El backend bloquea si se pasa del cupo o si el cliente tiene facturas
    // vencidas. Solo se salta con la clave dinamica OVERRIDE_CREDIT_BLOCK (frontend-gated, se pasa
    // el flag overrideCreditBlockAuthorized), reservada a excepciones que autoriza administracion.
    if (dto.isCredit && invoice.customer) {
      // 1) Cupo
      const pendingReceivables = await this.prisma.receivable.aggregate({
        where: {
          customerId: invoice.customerId,
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
        _sum: { amountUsd: true },
      });
      const currentDebt = pendingReceivables._sum.amountUsd || 0;
      const availableCredit = invoice.customer.creditLimit - currentDebt;
      const overLimit = effectiveTotalUsd > availableCredit + 0.01;

      // 2) Vencidos: status OVERDUE (marcado por el cron a las 00:01) O dueDate < hoy (Caracas)
      // aun sin marcar — cubre el desfase del cron.
      const overdueCount = await this.prisma.receivable.count({
        where: {
          customerId: invoice.customerId,
          OR: [
            { status: 'OVERDUE' },
            { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { lt: caracasDateKey() } },
          ],
        },
      });
      const hasOverdue = overdueCount > 0;

      if ((overLimit || hasOverdue) && !dto.overrideCreditBlockAuthorized) {
        const reasons: string[] = [];
        if (overLimit)
          reasons.push(
            `excede el cupo (disponible $${availableCredit.toFixed(2)}, requerido $${effectiveTotalUsd.toFixed(2)})`,
          );
        if (hasOverdue) reasons.push('tiene facturas vencidas');
        throw new BadRequestException(
          `No se puede facturar a credito: el cliente ${reasons.join(' y ')}. Requiere autorizacion de supervisor.`,
        );
      }
    }

    // IGTF: se calcula UNA sola vez por factura, sobre el primer pago en divisas
    // Solo aplica si la caja es fiscal
    const isIGTFContributor = config?.isIGTFContributor || false;
    const igtfPct = config?.igtfPct || 3;
    const isCajaFiscal = paymentSerie.isFiscal || false;
    let invoiceIgtfUsd = 0;
    let invoiceIgtfBs = 0;

    if (isIGTFContributor && isCajaFiscal && invoice.igtfUsd === 0) {
      // Base IGTF = divisa que REALMENTE paga la factura, NO el vuelto. Se topa al total
      // (bienes+IVA) descontando lo cubierto por otros metodos, para no gravar el sobrepago
      // que se devuelve como vuelto.
      const divisaPaidUsd = dto.payments
        .filter(p => methodMap.get(p.methodId)?.isDivisa)
        .reduce((s, p) => s + p.amountUsd, 0);
      const nonDivisaPaidUsd = dto.payments
        .filter(p => !methodMap.get(p.methodId)?.isDivisa)
        .reduce((s, p) => s + p.amountUsd, 0);
      const igtfBaseUsd = Math.max(0, Math.min(divisaPaidUsd, effectiveTotalUsd - nonDivisaPaidUsd));
      if (igtfBaseUsd > 0) {
        invoiceIgtfUsd = Math.round(igtfBaseUsd * (igtfPct / 100) * 100) / 100;
        invoiceIgtfBs = Math.round(invoiceIgtfUsd * invoice.exchangeRate * 100) / 100;
      }
    }

    const newTotalUsd = invoiceIgtfUsd > 0
      ? Math.round((effectiveTotalUsd + invoiceIgtfUsd) * 100) / 100
      : effectiveTotalUsd;
    const newTotalBs = invoiceIgtfUsd > 0
      ? Math.round((effectiveTotalBs + invoiceIgtfBs) * 100) / 100
      : effectiveTotalBs;

    // Calculate total paid in USD from divisa methods
    const totalPaidDivisaUsd = dto.payments
      .filter(p => methodMap.get(p.methodId)?.isDivisa)
      .reduce((s, p) => s + p.amountUsd, 0);
    const hasOverpayment = totalPaidDivisaUsd > newTotalUsd + 0.01;

    // Adjust last payment so USD and Bs sums match invoice totals exactly
    // Skip adjustment when there's an overpayment (change scenario)
    if (dto.payments.length >= 1 && !hasOverpayment) {
      const lastIdx = dto.payments.length - 1;
      const prevUsd = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountUsd, 0);
      const prevBs = dto.payments.slice(0, lastIdx).reduce((s, p) => s + p.amountBs, 0);
      const adjustedUsd = Math.round((newTotalUsd - prevUsd) * 100) / 100;
      const adjustedBs = Math.round((newTotalBs - prevBs) * 100) / 100;
      if (adjustedUsd >= 0 && adjustedBs >= 0) {
        dto.payments[lastIdx].amountUsd = adjustedUsd;
        dto.payments[lastIdx].amountBs = adjustedBs;
      }
    }

    // Change (vuelto) calculation
    let changeUsd = 0;
    let changeBs = 0;
    if (hasOverpayment) {
      changeUsd = Math.round((totalPaidDivisaUsd - newTotalUsd) * 100) / 100;
      changeBs = Math.round(changeUsd * invoice.exchangeRate * 100) / 100;
      if (!dto.changeMethodId) {
        throw new BadRequestException('Debe seleccionar un metodo de vuelto cuando el pago en USD excede el total');
      }
      const changeMethod = await this.prisma.paymentMethod.findUnique({ where: { id: dto.changeMethodId } });
      if (!changeMethod) {
        throw new BadRequestException('Metodo de vuelto no encontrado');
      }
      if (changeMethod.isDivisa) {
        throw new BadRequestException('El metodo de vuelto no puede ser en divisas');
      }
    }

    // Execute everything in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Generate correlative number with SELECT FOR UPDATE on Serie
      // Las facturas usan su propio contador (lastInvoiceNumber), independiente de las notas
      const seriesRows = await tx.$queryRaw<any[]>`
        SELECT "id", "lastInvoiceNumber", "prefix" FROM "Serie"
        WHERE id = ${paymentSerie.id} FOR UPDATE
      `;
      const s = seriesRows[0];
      const nextNumber = s.lastInvoiceNumber + 1;

      await tx.serie.update({
        where: { id: paymentSerie.id },
        data: { lastInvoiceNumber: nextNumber },
      });

      const year = new Date().getFullYear().toString().slice(-2);
      const correlativo = nextNumber.toString().padStart(8, '0');
      const invoiceNumber = `${s.prefix}-${year}-${correlativo}`;

      // If the payment serie is VAT exempt, update item records to EXEMPT
      if (paymentSerie.isVatExempt) {
        for (const item of invoice.items) {
          const lineSubtotal = item.unitPrice * item.quantity;
          const lineTotalBs = Math.round(lineSubtotal * invoice.exchangeRate * 100) / 100;

          await tx.invoiceItem.update({
            where: { id: item.id },
            data: {
              ivaType: 'EXEMPT',
              ivaAmount: 0,
              totalUsd: lineSubtotal,
              ivaAmountBs: 0,
              totalBs: lineTotalBs,
            },
          });
        }
      }

      // Create payments
      let igtfAssigned = false;
      for (const payment of dto.payments) {
        const paymentMethod = methodMap.get(payment.methodId)!;
        let paymentIgtfUsd = 0;
        let paymentIgtfBs = 0;

        if (!igtfAssigned && invoiceIgtfUsd > 0 && paymentMethod.isDivisa) {
          paymentIgtfUsd = invoiceIgtfUsd;
          paymentIgtfBs = invoiceIgtfBs;
          igtfAssigned = true;
        }

        await tx.payment.create({
          data: {
            invoiceId: id,
            methodId: payment.methodId,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: invoice.exchangeRate,
            reference: payment.reference,
            igtfUsd: paymentIgtfUsd,
            igtfBs: paymentIgtfBs,
          },
        });

        // Create Receivable for financing platforms (Cashea, Crediagro, etc.)
        if (paymentMethod.createsReceivable) {
          await tx.receivable.create({
            data: {
              type: 'FINANCING_PLATFORM',
              platformName: paymentMethod.name,
              reference: payment.reference || null,
              invoiceId: id,
              amountUsd: payment.amountUsd,
              amountBs: payment.amountBs,
              exchangeRate: invoice.exchangeRate,
            },
          });
        }

        // Handle SALDO_A_FAVOR: consume advances first, then NCV notes
        if (payment.methodId === 'pm_saldo_favor' && invoice.customerId) {
          // 1. Get available advances (FIFO by createdAt)
          const advances = await tx.customerAdvance.findMany({
            where: {
              customerId: invoice.customerId,
              status: { in: ['AVAILABLE', 'PARTIAL'] },
            },
            orderBy: { createdAt: 'asc' },
          });

          // 2. Get available NCV credit notes
          const customerInvoices = await tx.invoice.findMany({
            where: { customerId: invoice.customerId },
            select: { id: true },
          });
          const invIds = customerInvoices.map((i) => i.id);
          let creditNotes: any[] = [];
          if (invIds.length > 0) {
            creditNotes = await tx.creditDebitNote.findMany({
              where: {
                invoiceId: { in: invIds },
                type: 'NCV',
                status: 'POSTED',
                appliedAt: null,
              },
              orderBy: { createdAt: 'asc' },
            });
          }

          // 3. Validate total balance
          const advanceBalance = advances.reduce(
            (sum, a) => sum + (a.amountUsd - a.paidAmountUsd), 0,
          );
          const ncvBalance = creditNotes.reduce(
            (sum, n) => sum + (n.totalUsd - n.paidAmountUsd), 0,
          );
          const availableBalance = advanceBalance + ncvBalance;

          if (payment.amountUsd > availableBalance + 0.01) {
            throw new BadRequestException(
              `El monto excede el saldo a favor disponible del cliente ($${availableBalance.toFixed(2)})`,
            );
          }

          let remaining = payment.amountUsd;

          // 4. Consume advances first (FIFO)
          for (const advance of advances) {
            if (remaining <= 0) break;
            const advRemaining = advance.amountUsd - advance.paidAmountUsd;
            if (advRemaining <= 0) continue;
            const used = Math.min(remaining, advRemaining);
            remaining -= used;
            const newPaidUsd = Math.round((advance.paidAmountUsd + used) * 100) / 100;
            const newPaidBs = Math.round(newPaidUsd * advance.exchangeRate * 100) / 100;
            const fullyConsumed = newPaidUsd >= advance.amountUsd - 0.01;
            await tx.customerAdvance.update({
              where: { id: advance.id },
              data: {
                paidAmountUsd: newPaidUsd,
                paidAmountBs: newPaidBs,
                status: fullyConsumed ? 'CONSUMED' : 'PARTIAL',
              },
            });
          }

          // 5. Then consume NCVs
          for (const note of creditNotes) {
            if (remaining <= 0) break;
            const noteRemaining = note.totalUsd - note.paidAmountUsd;
            if (noteRemaining <= 0) continue;
            const used = Math.min(remaining, noteRemaining);
            remaining -= used;
            const newPaid = Math.round((note.paidAmountUsd + used) * 100) / 100;
            const fullyConsumed = newPaid >= note.totalUsd - 0.01;
            await tx.creditDebitNote.update({
              where: { id: note.id },
              data: {
                paidAmountUsd: newPaid,
                appliedAt: fullyConsumed ? new Date() : null,
              },
            });
          }
        }
      }

      // Create credit receivable (uses totals with IGTF included)
      if (dto.isCredit && invoice.customerId) {
        // Dias fijos definidos por administracion en el cliente (fuente unica de verdad).
        const creditDays = invoice.customer?.creditDays ?? dto.creditDays ?? 30;
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

        // Auto-crear retención de IVA si el cliente es contribuyente especial
        // (solo serie fiscal, no exenta, con IVA > 0)
        if (
          invoice.customer?.isSpecialTaxpayer &&
          paymentSerie.isFiscal &&
          !paymentSerie.isVatExempt &&
          (invoice.ivaBs || 0) > 0
        ) {
          const retPct = config?.ivaRetentionPct || 75;
          const retBs = Math.round(invoice.ivaBs * (retPct / 100) * 100) / 100;
          const retUsd = invoice.exchangeRate > 0
            ? Math.round((retBs / invoice.exchangeRate) * 100) / 100
            : 0;
          let retBaseUsd = 0;
          for (const item of invoice.items) {
            if (item.ivaType !== 'EXEMPT') retBaseUsd += item.unitPrice * item.quantity;
          }
          retBaseUsd = Math.round(retBaseUsd * 100) / 100;

          const lastRet = await tx.customerIvaRetention.findFirst({
            where: { number: { startsWith: 'RVC-' } },
            orderBy: { createdAt: 'desc' },
            select: { number: true },
          });
          let nextRetNum = 1;
          if (lastRet) {
            const n = parseInt(lastRet.number.split('-')[1], 10);
            if (!isNaN(n)) nextRetNum = n + 1;
          }

          await tx.customerIvaRetention.create({
            data: {
              number: `RVC-${String(nextRetNum).padStart(4, '0')}`,
              invoiceId: id,
              customerId: invoice.customerId,
              taxableBaseUsd: retBaseUsd,
              taxableBaseBs: Math.round(retBaseUsd * invoice.exchangeRate * 100) / 100,
              ivaAmountUsd: invoice.ivaUsd || 0,
              ivaAmountBs: invoice.ivaBs || 0,
              retentionPct: retPct,
              retentionUsd: retUsd,
              retentionBs: retBs,
              exchangeRate: invoice.exchangeRate,
              notes: 'Generada automáticamente (cliente contribuyente especial)',
              createdById: user.id,
            },
          });
        }
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
            reason: `Venta factura ${invoiceNumber}`,
            reference: invoiceNumber,
            sourceType: 'SALE_INVOICE',
            sourceId: id,
            createdById: user.id,
          },
        });
      }

      // Record change (vuelto) on the first divisa payment
      if (changeBs > 0 && dto.changeMethodId) {
        const firstDivisaPayment = await tx.payment.findFirst({
          where: { invoiceId: id },
          orderBy: { createdAt: 'asc' },
        });
        if (firstDivisaPayment) {
          await tx.payment.update({
            where: { id: firstDivisaPayment.id },
            data: {
              changeAmountBs: changeBs,
              changeMethodId: dto.changeMethodId,
            },
          });
        }
      }

      // Update invoice: assign number, serie, status, IGTF, cashier, release lock
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          number: invoiceNumber,
          serieId: paymentSerie.id,
          cashRegisterId: serieCashRegisterId,
          status: 'PAID',
          paymentType: dto.isCredit ? 'CREDIT' : 'CASH',
          isCredit: dto.isCredit || false,
          creditDays: dto.isCredit ? (invoice.customer?.creditDays ?? dto.creditDays ?? 30) : 0,
          dueDate: dto.isCredit
            ? new Date(Date.now() + (invoice.customer?.creditDays ?? dto.creditDays ?? 30) * 86400000)
            : null,
          paidAt: new Date(),
          cashierId: user.id,
          lockedById: null,
          lockedAt: null,
          igtfUsd: invoiceIgtfUsd,
          igtfBs: invoiceIgtfBs,
          subtotalUsd: effectiveSubtotalUsd,
          subtotalBs: effectiveSubtotalBs,
          ivaUsd: paymentSerie.isVatExempt ? 0 : invoice.ivaUsd,
          ivaBs: paymentSerie.isVatExempt ? 0 : invoice.ivaBs,
          totalUsd: newTotalUsd,
          totalBs: newTotalBs,
          totalPaidUsd: hasOverpayment ? Math.round(totalPaidDivisaUsd * 100) / 100 : 0,
          changeBs: changeBs,
        },
        include: {
          items: true,
          payments: { include: { method: true, changeMethod: true } },
          customer: true,
          receivables: true,
          seller: { select: { id: true, code: true, name: true } },
          cashier: { select: { id: true, name: true } },
          cashRegister: { select: { id: true, code: true, name: true } },
          serie: { select: { id: true, name: true, prefix: true, isFiscal: true, comPort: true } },
        },
      });

      // Create PrintJobs grouped by print area (con fallback al área por defecto)
      const printGroups = await buildPrintAreaGroups(
        tx,
        invoice.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
        })),
      );
      for (const group of printGroups) {
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

    // Auto-create SalesBookEntry for fiscal invoices
    if (result.serie?.isFiscal) {
      try {
        const exchangeRate = result.exchangeRate || 1;
        let exemptBs = 0;
        let taxableBaseBs = 0;
        let ivaBs = 0;

        for (const item of result.items) {
          const base = item.unitPrice * item.quantity;
          const baseBs = base * exchangeRate;
          if (item.ivaType === 'EXEMPT') {
            exemptBs += baseBs;
          } else {
            taxableBaseBs += baseBs;
            ivaBs += item.ivaAmountBs || (item.ivaAmount * exchangeRate);
          }
        }

        await this.prisma.salesBookEntry.create({
          data: {
            invoiceId: result.id,
            entryDate: result.paidAt || new Date(),
            invoiceNumber: result.number!,
            controlNumber: result.controlNumber || null,
            customerName: result.customer?.name || 'Cliente General',
            customerRif: result.customer?.rif
              ? `${result.customer.documentType || ''}${result.customer.documentType ? '-' : ''}${result.customer.rif}`
              : null,
            exemptAmountBs: Math.round(exemptBs * 100) / 100,
            taxableBaseBs: Math.round(taxableBaseBs * 100) / 100,
            ivaAmountBs: Math.round(ivaBs * 100) / 100,
            igtfAmountBs: Math.round((result.igtfBs || 0) * 100) / 100,
            totalBs: Math.round((result.totalBs || 0) * 100) / 100,
            isManual: false,
            documentType: 'FACTURA',
            createdById: user.id,
          },
        });
      } catch (err) {
        // Don't fail the payment if SalesBookEntry creation fails
        console.error('[InvoicesService] Error creating SalesBookEntry:', err);
      }
    }

    return result;
  }

  async retake(id: string, user: { id: string; role: UserRole }) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        customer: true,
        seller: { select: { id: true, code: true, name: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== 'PENDING') {
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

    // Enrich items with product's current priceDetal so the POS can
    // reconstruct the correct price regardless of the serie's VAT exemption
    const productIds = invoice.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, priceDetal: true },
    });
    const priceMap = new Map(products.map((p) => [p.id, p.priceDetal]));

    return {
      ...invoice,
      items: invoice.items.map((item) => ({
        ...item,
        priceDetal: priceMap.get(item.productId) ?? null,
      })),
    };
  }

  async updateItems(
    id: string,
    dto: CreateInvoiceDto,
    user: { id: string; role: UserRole },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden editar facturas en espera');
    }

    // Get today's exchange rate
    const today = caracasDateKey();
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException('No hay tasa BCV registrada para hoy');
    }

    // Get company config for brega calculation
    const config = await this.prisma.companyConfig.findFirst();
    const bregaGlobalPct = config?.bregaGlobalPct || 0;

    // Get serie for VAT exempt check
    const invoiceSerie = await this.prisma.serie.findUnique({
      where: { cashRegisterId: invoice.cashRegisterId },
    });

    // Fetch products and calculate totals
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalUsd = 0;
    let subtotalBsAccum = 0;
    let ivaBsAccum = 0;
    const ivaBreakdown: Record<string, number> = {};
    const itemsData: any[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new BadRequestException(`Producto ${item.productId} no encontrado`);

      // priceDetal already includes IVA — extract base price using original product rate
      const priceWithIva = item.unitPrice ?? product.priceDetal;
      const originalIvaRate = IVA_RATES[product.ivaType] || 0;
      const effectiveIvaType = invoiceSerie?.isVatExempt ? 'EXEMPT' : product.ivaType;
      const ivaRate = IVA_RATES[effectiveIvaType] || 0;
      const ivaMultiplier = 1 + originalIvaRate;
      const baseUnitPrice = priceWithIva / ivaMultiplier;

      // Apply line discount
      const discountPct = item.discountPct || 0;
      const discountMultiplier = 1 - discountPct / 100;
      const discountedBasePrice = baseUnitPrice * discountMultiplier;
      const lineSubtotal = discountedBasePrice * item.quantity;
      const ivaAmount = lineSubtotal * ivaRate;

      // Bs driven: calculate from Bs subtotal to match fiscal printer
      const lineSubtotalBs = Math.round(lineSubtotal * rate.rate * 100) / 100;
      const lineIvaBs = Math.round(lineSubtotalBs * ivaRate * 100) / 100;
      const lineTotalBs = Math.round((lineSubtotalBs + lineIvaBs) * 100) / 100;

      const unitPriceWithoutIva = priceWithIva / ivaMultiplier;
      const unitPriceWithoutIvaBs = Math.round(unitPriceWithoutIva * rate.rate * 100) / 100;
      const costUsd = product.bregaApplies
        ? product.costUsd * (1 + bregaGlobalPct / 100)
        : product.costUsd;
      const costBs = Math.round(costUsd * rate.rate * 100) / 100;

      subtotalUsd += lineSubtotal;
      subtotalBsAccum += lineSubtotalBs;
      ivaBsAccum += lineIvaBs;
      ivaBreakdown[effectiveIvaType] = (ivaBreakdown[effectiveIvaType] || 0) + ivaAmount;

      itemsData.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: baseUnitPrice,
        ivaType: effectiveIvaType,
        ivaAmount,
        totalUsd: lineSubtotal + ivaAmount,
        unitPriceBs: Math.round(baseUnitPrice * rate.rate * 100) / 100,
        ivaAmountBs: lineIvaBs,
        totalBs: lineTotalBs,
        unitPriceWithoutIva,
        unitPriceWithoutIvaBs,
        discountPct,
        costUsd,
        costBs,
        priceOverridden: item.priceOverridden || (item.unitPrice != null && Math.abs(item.unitPrice - product.priceDetal) > 0.001),
      });
    }

    const totalIva = Object.values(ivaBreakdown).reduce((s, v) => s + v, 0);
    const totalUsd = subtotalUsd + totalIva;

    // Update in transaction: delete old items, create new, update totals, release lock
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      return tx.invoice.update({
        where: { id },
        data: {
          customerId: dto.customerId || null,
          sellerId: dto.sellerId || invoice.sellerId,
          subtotalUsd: Math.round(subtotalUsd * 100) / 100,
          ivaUsd: Math.round(totalIva * 100) / 100,
          totalUsd: Math.round(totalUsd * 100) / 100,
          subtotalBs: Math.round(subtotalBsAccum * 100) / 100,
          ivaBs: Math.round(ivaBsAccum * 100) / 100,
          totalBs: Math.round((subtotalBsAccum + ivaBsAccum) * 100) / 100,
          exchangeRate: rate.rate,
          notes: dto.notes,
          lockedById: null,
          lockedAt: null,
          items: { create: itemsData },
        },
        include: {
          items: true,
          customer: true,
          seller: { select: { id: true, code: true, name: true } },
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

  async cancel(id: string, user: { id: string; role: UserRole }) {
    if (!['ADMIN', 'SUPERVISOR'].includes(user.role)) {
      throw new ForbiddenException('Solo ADMIN o SUPERVISOR pueden cancelar facturas');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (invoice.status === 'PAID') {
      throw new BadRequestException(
        'Las facturas pagadas no pueden cancelarse. Emite una nota de credito.',
      );
    }

    if (invoice.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden cancelar facturas en espera');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'CANCELLED', lockedById: null, lockedAt: null },
    });
  }

  async updateFiscalInfo(
    id: string,
    data: { fiscalNumber: string; machineSerial: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    return this.prisma.invoice.update({
      where: { id },
      data: {
        fiscalNumber: data.fiscalNumber,
        fiscalMachineSerial: data.machineSerial,
        fiscalPrinted: true,
      },
    });
  }

  async updateFiscalStatus(
    id: string,
    data: {
      fiscalPrinted?: boolean;
      fiscalNumber?: string | null;
      fiscalMachineSerial?: string | null;
    },
    user: { id: string; role: UserRole },
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede modificar el estado fiscal');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const updateData: any = {};
    if (data.fiscalPrinted !== undefined) updateData.fiscalPrinted = data.fiscalPrinted;
    if (data.fiscalNumber !== undefined) updateData.fiscalNumber = data.fiscalNumber;
    if (data.fiscalMachineSerial !== undefined) updateData.fiscalMachineSerial = data.fiscalMachineSerial;

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, user: { id: string; role: UserRole }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (invoice.status !== 'PENDING') {
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
