import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Eliminar una CxC manual (no proveniente de factura) si no fue cruzada/cobrada en un recibo.
  async remove(id: string) {
    const r = await this.prisma.receivable.findUnique({
      where: { id },
      include: { payments: true, receiptItems: true },
    });
    if (!r) throw new NotFoundException('Cuenta por cobrar no encontrada');
    if (r.invoiceId || r.type !== 'MANUAL') {
      throw new BadRequestException('Solo se pueden eliminar CxC manuales; las de una factura se gestionan con nota de credito');
    }
    if (r.status === 'PAID' || r.status === 'PARTIAL' || (r.paidAmountUsd || 0) > 0 || r.payments.length > 0 || r.receiptItems.length > 0) {
      throw new BadRequestException('No se puede eliminar: la CxC ya fue cruzada o cobrada en un recibo');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.salesBookEntry.deleteMany({ where: { receivableId: id } });
      await tx.receivable.delete({ where: { id } });
    });
    return { message: 'Cuenta por cobrar eliminada' };
  }

  async create(dto: CreateReceivableDto, userId?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    // Tasa: la que envia el usuario (editable) tiene prioridad; si no, la registrada de hoy
    let r: number;
    if (dto.exchangeRate && dto.exchangeRate > 0) {
      r = dto.exchangeRate;
    } else {
      const today = caracasDateKey();
      const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
      if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');
      r = rate.rate;
    }

    // Resolve serie and fiscal status
    let serie: any = null;
    let isFiscal = false;
    if (dto.serieId) {
      serie = await this.prisma.serie.findUnique({ where: { id: dto.serieId } });
      if (!serie) throw new BadRequestException('Serie no encontrada');
      if (serie.type !== 'SALES') throw new BadRequestException('La serie debe ser de tipo VENTAS');
      isFiscal = serie.isFiscal;
    }

    const currency = dto.currency || 'USD';

    // Fiscal breakdown in input currency
    const exemptBase = dto.exemptBase || 0;
    const taxableBase8 = dto.taxableBase8 || 0;
    const taxableBase16 = dto.taxableBase16 || 0;
    const taxableBase31 = dto.taxableBase31 || 0;

    // Auto-calculate IVA
    const iva8 = Math.round(taxableBase8 * 0.08 * 100) / 100;
    const iva16 = Math.round(taxableBase16 * 0.16 * 100) / 100;
    const iva31 = Math.round(taxableBase31 * 0.31 * 100) / 100;
    const totalIva = Math.round((iva8 + iva16 + iva31) * 100) / 100;

    // IGTF
    const igtfPct = dto.igtfPct || 0;
    const subtotal = exemptBase + taxableBase8 + taxableBase16 + taxableBase31 + totalIva;
    const igtf = Math.round(subtotal * (igtfPct / 100) * 100) / 100;
    const total = Math.round((subtotal + igtf) * 100) / 100;

    // Convert to both currencies
    const toUsd = (val: number) => currency === 'USD' ? val : Math.round((val / r) * 100) / 100;
    const toBs = (val: number) => currency === 'USD' ? Math.round((val * r) * 100) / 100 : val;

    const amountUsd = toUsd(total);
    const amountBs = toBs(total);

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const originalDate = dto.originalDate ? new Date(dto.originalDate) : null;
    const receptionDate = dto.receptionDate ? new Date(dto.receptionDate) : null;

    return this.prisma.$transaction(async (tx) => {
      // Generate correlative number
      const yearSuffix = (originalDate || new Date()).getFullYear().toString().slice(-2);
      let number: string;
      if (serie) {
        // Correlativo dirigido por la serie, con contador propio de CxC (como las notas).
        // Formato: {prefijo}-CXC-{anio}-{correlativo8}  ej. VF-CXC-26-00000001
        const rows = await tx.$queryRaw<any[]>`
          SELECT "id", "prefix", "lastReceivableNumber" FROM "Serie"
          WHERE id = ${serie.id} FOR UPDATE
        `;
        const s = rows[0];
        const next = (s.lastReceivableNumber || 0) + 1;
        await tx.serie.update({
          where: { id: serie.id },
          data: { lastReceivableNumber: next } as any,
        });
        number = `${s.prefix}-CXC-${yearSuffix}-${next.toString().padStart(8, '0')}`;
      } else {
        // Sin serie (no fiscal): correlativo global de respaldo
        const config = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });
        const nextNum = config?.receivableNextNumber || 1;
        number = `CXC/${yearSuffix}-${nextNum.toString().padStart(6, '0')}`;
        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { receivableNextNumber: nextNum + 1 } as any,
        });
      }

      const receivable = await tx.receivable.create({
        data: {
          number,
          type: 'MANUAL',
          customerId: dto.customerId,
          invoiceId: null,
          documentNumber: dto.documentNumber?.trim() || null,
          description: dto.description || null,
          amountUsd,
          amountBs,
          exchangeRate: r,
          dueDate,
          notes: dto.notes || null,
          serieId: dto.serieId || null,
          currency,
          originalDate,
          receptionDate,
          paymentTerms: dto.paymentTerms || null,
          exemptBaseUsd: toUsd(exemptBase),
          exemptBaseBs: toBs(exemptBase),
          taxableBase8Usd: toUsd(taxableBase8),
          taxableBase8Bs: toBs(taxableBase8),
          taxableBase16Usd: toUsd(taxableBase16),
          taxableBase16Bs: toBs(taxableBase16),
          taxableBase31Usd: toUsd(taxableBase31),
          taxableBase31Bs: toBs(taxableBase31),
          iva8Usd: toUsd(iva8),
          iva8Bs: toBs(iva8),
          iva16Usd: toUsd(iva16),
          iva16Bs: toBs(iva16),
          iva31Usd: toUsd(iva31),
          iva31Bs: toBs(iva31),
          totalIvaUsd: toUsd(totalIva),
          totalIvaBs: toBs(totalIva),
          igtfPct,
          igtfUsd: toUsd(igtf),
          igtfBs: toBs(igtf),
          createdById: userId || null,
        },
        include: {
          customer: { select: { id: true, name: true, documentType: true, rif: true } },
          serie: { select: { id: true, name: true, isFiscal: true } },
        },
      });

      // If fiscal (determined by serie), create SalesBookEntry
      if (isFiscal && userId) {
        const totalBsForBook = toBs(total);
        const exemptBs = toBs(exemptBase);
        const taxableBs = toBs(taxableBase8 + taxableBase16 + taxableBase31);
        const ivaBs = toBs(totalIva);
        const igtfBs = toBs(igtf);
        // Nro. de factura para el libro: el que ingresa el usuario, o el correlativo de la CxC.
        const bookInvoiceNumber = dto.documentNumber?.trim() || number;

        await tx.salesBookEntry.create({
          data: {
            receivableId: receivable.id,
            entryDate: originalDate || new Date(),
            invoiceNumber: bookInvoiceNumber,
            controlNumber: null,
            customerName: customer.name,
            customerRif: customer.rif || null,
            exemptAmountBs: exemptBs,
            taxableBaseBs: taxableBs,
            ivaAmountBs: ivaBs,
            igtfAmountBs: igtfBs,
            totalBs: totalBsForBook,
            isManual: true,
            documentType: 'CXC',
            createdById: userId,
          },
        });

        // Retencion de IVA sufrida (cliente contribuyente especial): linea negativa en el
        // libro de ventas con el numero del comprobante del cliente. Simetrico a la CxP.
        // No resta el neto de la CxC (se netea al cobrar); solo declara la retencion.
        if (dto.createRetention && totalIva > 0) {
          const config = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });
          const retPct = dto.retentionPct ?? (config as any)?.ivaRetentionPct ?? 75;
          const retentionBs = Math.round(ivaBs * (retPct / 100) * 100) / 100;
          await tx.salesBookEntry.create({
            data: {
              receivableId: receivable.id,
              entryDate: originalDate || new Date(),
              invoiceNumber: bookInvoiceNumber,
              controlNumber: null,
              customerName: customer.name,
              customerRif: customer.rif || null,
              exemptAmountBs: 0,
              taxableBaseBs: 0,
              ivaAmountBs: 0,
              igtfAmountBs: 0,
              totalBs: 0,
              isManual: true,
              isRetentionLine: true,
              documentType: 'RETENCION',
              affectedDocNumber: bookInvoiceNumber,
              retentionAmountBs: retentionBs,
              retentionVoucherNumber: dto.retentionDocNumber?.trim() || null,
              notes: dto.retentionDocNumber?.trim() || null,
              createdById: userId,
            },
          });
        }
      }

      return receivable;
    });
  }

  async getNextNumber() {
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const nextNum = (config as any)?.receivableNextNumber || 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    return { nextNumber: `CXC/${yearSuffix}-${nextNum.toString().padStart(6, '0')}` };
  }

  private buildWhere(query: QueryReceivablesDto): any {
    const where: any = {};

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.platformName) {
      where.platformName = query.platformName;
    }
    if (query.reference) {
      // Busqueda libre: Ref/Orden + nombre o cedula del cliente (directo o via factura).
      const q = query.reference;
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { rif: { contains: q, mode: 'insensitive' } } },
        { invoice: { customer: { name: { contains: q, mode: 'insensitive' } } } },
        { invoice: { customer: { rif: { contains: q, mode: 'insensitive' } } } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        where.createdAt.gte = caracasDayStart(query.from);
      }
      if (query.to) {
        where.createdAt.lte = caracasDayEnd(query.to);
      }
    }
    if (query.overdue) {
      // Vencida = fecha pasada y aun no pagada. Incluye OVERDUE (ya marcada por el cron)
      // Y las PENDING/PARTIAL que el cron todavia no marco, para no dejar ninguna fuera.
      const now = caracasDateKey();
      where.dueDate = { lt: now };
      where.status = { in: ['PENDING', 'PARTIAL', 'OVERDUE'] };
    } else if (query.dueWithinDays !== undefined && query.dueWithinDays !== null && !Number.isNaN(query.dueWithinDays)) {
      // Proximas a vencer: dueDate entre el inicio de hoy y el fin del dia (hoy+N) en
      // hora Caracas (aun no vencidas, no pagadas). El dueDate lleva hora, por eso se
      // usan los limites de dia-Caracas (no la medianoche-UTC de caracasDateKey).
      const start = caracasDayStart();
      const end = caracasDayEnd(new Date(Date.now() + query.dueWithinDays * 24 * 60 * 60 * 1000));
      where.dueDate = { gte: start, lte: end };
      where.status = { in: ['PENDING', 'PARTIAL'] };
    }
    if (query.employeeOnly) {
      where.customer = { ...(where.customer || {}), isEmployee: true };
    }
    return where;
  }

  async findAll(query: QueryReceivablesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.receivable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, documentType: true, rif: true } },
          // Cliente de la factura: para CxC de plataforma (Cashea) el customerId es null
          // pero la factura original si tiene cliente; asi mostramos nombre + cedula en la lista.
          invoice: { select: { id: true, number: true, customer: { select: { id: true, name: true, documentType: true, rif: true } } } },
          serie: { select: { id: true, name: true, isFiscal: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, amountUsd: true, createdAt: true, receiptId: true, method: { select: { id: true, name: true } }, receipt: { select: { id: true, number: true } } },
          },
        },
      }),
      this.prisma.receivable.count({ where }),
    ]);

    const enriched = data.map((r) => ({
      ...r,
      balanceUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Todos los registros que matchean el filtro (sin paginar), para el reporte PDF.
  async findAllForReport(query: QueryReceivablesDto) {
    const where = this.buildWhere(query);
    const data = await this.prisma.receivable.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        customer: { select: { id: true, name: true, rif: true } },
        invoice: { select: { id: true, number: true } },
      },
    });
    return data.map((r) => ({
      ...r,
      balanceUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100,
    }));
  }

  async findOne(id: string) {
    const receivable = await this.prisma.receivable.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: { select: { id: true, number: true, totalUsd: true, createdAt: true } },
        serie: { select: { id: true, name: true, isFiscal: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            method: true,
            receipt: { select: { id: true, number: true } },
          },
        },
      },
    });
    if (!receivable) throw new NotFoundException('Cuenta por cobrar no encontrada');
    return {
      ...receivable,
      balanceUsd: Math.round((receivable.amountUsd - receivable.paidAmountUsd) * 100) / 100,
    };
  }

  async summary() {
    const pending = await this.prisma.receivable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    const platformMap: Record<string, { totalUsd: number; count: number }> = {};
    const statusMap: Record<string, { count: number; totalUsd: number }> = {};

    // Vencida = fecha de vencimiento ya pasada (no depende del status OVERDUE que
    // pinta el cron), asi la tarjeta coincide con el filtro "Solo vencidas".
    const todayKey = caracasDateKey();
    for (const r of pending) {
      const balance = r.amountUsd - r.paidAmountUsd;
      totalPendingUsd += balance;

      if (r.dueDate && r.dueDate < todayKey) {
        totalOverdueUsd += balance;
      }

      if (r.platformName) {
        if (!platformMap[r.platformName]) {
          platformMap[r.platformName] = { totalUsd: 0, count: 0 };
        }
        platformMap[r.platformName].totalUsd += balance;
        platformMap[r.platformName].count += 1;
      }

      if (!statusMap[r.status]) {
        statusMap[r.status] = { count: 0, totalUsd: 0 };
      }
      statusMap[r.status].count += 1;
      statusMap[r.status].totalUsd += balance;
    }

    // Also include PAID in status breakdown
    const paidCount = await this.prisma.receivable.count({ where: { status: 'PAID' } });
    const paidSum = await this.prisma.receivable.aggregate({
      where: { status: 'PAID' },
      _sum: { amountUsd: true },
    });

    return {
      totalPendingUsd: Math.round(totalPendingUsd * 100) / 100,
      totalOverdueUsd: Math.round(totalOverdueUsd * 100) / 100,
      byPlatform: Object.entries(platformMap).map(([platformName, data]) => ({
        platformName,
        totalUsd: Math.round(data.totalUsd * 100) / 100,
        count: data.count,
      })),
      byStatus: [
        ...Object.entries(statusMap).map(([status, data]) => ({
          status,
          count: data.count,
          totalUsd: Math.round(data.totalUsd * 100) / 100,
        })),
        ...(paidCount > 0
          ? [{ status: 'PAID', count: paidCount, totalUsd: Math.round((paidSum._sum.amountUsd || 0) * 100) / 100 }]
          : []),
      ],
    };
  }

  async findByCustomer(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const receivables = await this.prisma.receivable.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: { select: { id: true, number: true } },
        serie: { select: { id: true, name: true, isFiscal: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amountUsd: true, createdAt: true, method: { select: { id: true, name: true } } },
        },
      },
    });

    const pending = receivables.filter((r) =>
      ['PENDING', 'PARTIAL', 'OVERDUE'].includes(r.status),
    );
    const totalDebt = pending.reduce((sum, r) => sum + (r.amountUsd - r.paidAmountUsd), 0);
    // Vencida = fecha pasada y no pagada (coincide con la tarjeta y el filtro).
    const todayKey = caracasDateKey();
    const totalOverdue = pending
      .filter((r) => r.dueDate && r.dueDate < todayKey)
      .reduce((sum, r) => sum + (r.amountUsd - r.paidAmountUsd), 0);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        documentType: customer.documentType,
        rif: customer.rif,
        creditLimit: customer.creditLimit,
        creditDays: customer.creditDays,
      },
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      availableCredit: Math.round((customer.creditLimit - totalDebt) * 100) / 100,
      receivables: receivables.map((r) => ({
        ...r,
        balanceUsd: Math.round((r.amountUsd - r.paidAmountUsd) * 100) / 100,
      })),
    };
  }

  async markOverdue(): Promise<number> {
    const now = caracasDateKey();

    const result = await this.prisma.receivable.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
