import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryReceivablesDto } from './dto/query-receivables.dto';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { caracasDateKey, caracasDayStart, caracasDayEnd } from '../../common/timezone';
import { CustomerIvaRetentionsService } from '../customer-iva-retentions/customer-iva-retentions.service';

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerRetentions: CustomerIvaRetentionsService,
  ) {}

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
        // RIF con prefijo (V-, J-, E-, G-...) para que el libro se vea formal.
        const bookRif = customer.rif
          ? (customer.documentType ? `${customer.documentType}-${customer.rif}` : customer.rif)
          : null;

        await tx.salesBookEntry.create({
          data: {
            receivableId: receivable.id,
            entryDate: originalDate || new Date(),
            invoiceNumber: bookInvoiceNumber,
            controlNumber: null,
            customerName: customer.name,
            customerRif: bookRif,
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

        // Retencion de IVA sufrida (cliente contribuyente especial): se crea un documento
        // CustomerIvaRetention (RVC-XXXX, visible en /sales/customer-retentions) mas su linea
        // en el libro de ventas. Simetrico al RetentionVoucher de la CxP. No resta el neto de
        // la CxC (se netea al cobrar); solo declara la retencion.
        if (dto.createRetention && totalIva > 0) {
          const config = await tx.companyConfig.findUnique({ where: { id: 'singleton' } });
          const retPct = dto.retentionPct ?? (config as any)?.ivaRetentionPct ?? 75;
          const totalIvaUsd = toUsd(totalIva);
          const retentionBs = Math.round(ivaBs * (retPct / 100) * 100) / 100;
          const retentionUsd = Math.round(totalIvaUsd * (retPct / 100) * 100) / 100;
          const taxableTotalCurr = taxableBase8 + taxableBase16 + taxableBase31;
          const voucherNumber = dto.retentionDocNumber?.trim() || null;

          await this.customerRetentions.createFromReceivableInTx(
            tx,
            {
              receivableId: receivable.id,
              customerId: customer.id,
              customerName: customer.name,
              customerRif: bookRif,
              documentNumber: bookInvoiceNumber,
              taxableBaseUsd: toUsd(taxableTotalCurr),
              taxableBaseBs: toBs(taxableTotalCurr),
              ivaAmountUsd: totalIvaUsd,
              ivaAmountBs: ivaBs,
              retentionPct: retPct,
              retentionUsd,
              retentionBs,
              exchangeRate: r,
              entryDate: originalDate || new Date(),
              voucherNumber,
              voucherDate: voucherNumber ? (originalDate || new Date()) : null,
            },
            userId,
          );
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
      // Acepta uno o varios tipos separados por coma (ej. "CUSTOMER_CREDIT,MANUAL" para la
      // vista unificada "Clientes"). Con uno solo se filtra directo; con varios, IN.
      const types = query.type.split(',').map((t) => t.trim()).filter(Boolean);
      where.type = types.length > 1 ? { in: types } : types[0];
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.customerId) {
      where.customerId = query.customerId;
    }
    if (query.platformName) {
      // Case-insensitive: el nombre de la plataforma = nombre del método de pago, que puede
      // estar en mayúsculas ('CASHEA') mientras el front filtra por 'Cashea'.
      where.platformName = { equals: query.platformName, mode: 'insensitive' };
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
        customer: { select: { id: true, name: true, documentType: true, rif: true, isGroupCompany: true } },
        invoice: {
          select: {
            id: true, number: true,
            customer: { select: { id: true, name: true, documentType: true, rif: true } },
            seller: { select: { id: true, code: true, name: true } },
          },
        },
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

  // Saldo y vencido por cliente para un conjunto de ids (usado por el buscador de clientes
  // al crear un recibo de cobro). Mismo criterio que summary()/findByCustomer:
  //   saldo   = Σ(amountUsd − paidAmountUsd) de CxC en PENDING/PARTIAL/OVERDUE
  //   vencido = igual pero solo las que ya vencieron (dueDate < hoy en Caracas)
  // Eficiente: 2 groupBy en vez de traer todas las filas.
  async balancesByCustomers(ids: string[]) {
    const clean = Array.from(new Set((ids || []).filter(Boolean)));
    if (clean.length === 0) return {} as Record<string, { saldo: number; vencido: number }>;

    const pendingStatuses: any = ['PENDING', 'PARTIAL', 'OVERDUE'];
    const todayKey = caracasDateKey();

    const [saldoRows, vencidoRows] = await Promise.all([
      this.prisma.receivable.groupBy({
        by: ['customerId'],
        where: { customerId: { in: clean }, status: { in: pendingStatuses } },
        _sum: { amountUsd: true, paidAmountUsd: true },
      }),
      this.prisma.receivable.groupBy({
        by: ['customerId'],
        where: { customerId: { in: clean }, status: { in: pendingStatuses }, dueDate: { lt: todayKey } },
        _sum: { amountUsd: true, paidAmountUsd: true },
      }),
    ]);

    const result: Record<string, { saldo: number; vencido: number }> = {};
    for (const id of clean) result[id] = { saldo: 0, vencido: 0 };
    for (const r of saldoRows) {
      if (!r.customerId) continue;
      result[r.customerId].saldo = Math.round(((r._sum?.amountUsd || 0) - (r._sum?.paidAmountUsd || 0)) * 100) / 100;
    }
    for (const r of vencidoRows) {
      if (!r.customerId) continue;
      result[r.customerId].vencido = Math.round(((r._sum?.amountUsd || 0) - (r._sum?.paidAmountUsd || 0)) * 100) / 100;
    }
    return result;
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

  // Análisis de las plataformas de financiamiento (Cashea/Crediagro). Todo se deriva de
  // las CxC type=FINANCING_PLATFORM (monto financiado = monto de la CxC) y su factura de
  // origen (para el % financiado vs cuota inicial). Solo lectura, sin datos nuevos.
  // El rango [from,to] filtra por createdAt (Caracas); si no viene, últimos 12 meses.
  async platformAnalytics(from?: string, to?: string) {
    const PLATFORMS = ['CASHEA', 'CREDIAGRO'];
    const start = from
      ? caracasDayStart(from)
      : caracasDayStart(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));
    const end = to ? caracasDayEnd(to) : caracasDayEnd();
    const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
    const r1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

    // A) Agregados del período + % financiado (necesita la factura de origen)
    const agg = await this.prisma.$queryRaw<any[]>`
      SELECT UPPER(r."platformName") AS platform,
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(r."amountUsd"), 0)::float8 AS "salesUsd",
        COALESCE(SUM(r."amountBs"), 0)::float8 AS "salesBs",
        COALESCE(SUM(r."paidAmountUsd"), 0)::float8 AS "collectedUsd",
        COALESCE(SUM(r."paidAmountBs"), 0)::float8 AS "collectedBs",
        COALESCE(SUM(r."amountUsd" - r."paidAmountUsd"), 0)::float8 AS "pendingUsd",
        COALESCE(SUM(r."amountBs" - r."paidAmountBs"), 0)::float8 AS "pendingBs",
        COALESCE(AVG(CASE WHEN i."totalUsd" > 0 THEN r."amountUsd" / i."totalUsd" * 100 END), 0)::float8 AS "avgFinancedPct",
        COALESCE(SUM(CASE WHEN i."totalUsd" > 0 THEN r."amountUsd" ELSE 0 END), 0)::float8 AS "financedBaseUsd",
        COALESCE(SUM(CASE WHEN i."totalUsd" > 0 THEN i."totalUsd" ELSE 0 END), 0)::float8 AS "invoiceBaseUsd"
      FROM "Receivable" r
      LEFT JOIN "Invoice" i ON i.id = r."invoiceId"
      WHERE r.type = 'FINANCING_PLATFORM'
        AND UPPER(r."platformName") IN ('CASHEA', 'CREDIAGRO')
        AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
      GROUP BY UPPER(r."platformName")`;

    // B) Días hasta saldar completa (CxC ya pagadas en el período)
    const full = await this.prisma.$queryRaw<any[]>`
      SELECT UPPER(r."platformName") AS platform,
        AVG(EXTRACT(EPOCH FROM (r."paidAt" - r."createdAt")) / 86400)::float8 AS "avgDaysToFull",
        COUNT(*)::int AS "paidCount"
      FROM "Receivable" r
      WHERE r.type = 'FINANCING_PLATFORM'
        AND UPPER(r."platformName") IN ('CASHEA', 'CREDIAGRO')
        AND r."paidAt" IS NOT NULL
        AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
      GROUP BY UPPER(r."platformName")`;

    // C) Días hasta el primer abono (CxC con al menos un pago en el período)
    const first = await this.prisma.$queryRaw<any[]>`
      SELECT UPPER(r."platformName") AS platform,
        AVG(EXTRACT(EPOCH FROM (fp.first_pay - r."createdAt")) / 86400)::float8 AS "avgDaysToFirst",
        COUNT(*)::int AS "withPaymentCount"
      FROM "Receivable" r
      JOIN (
        SELECT "receivableId", MIN("createdAt") AS first_pay
        FROM "ReceivablePayment" GROUP BY "receivableId"
      ) fp ON fp."receivableId" = r.id
      WHERE r.type = 'FINANCING_PLATFORM'
        AND UPPER(r."platformName") IN ('CASHEA', 'CREDIAGRO')
        AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
      GROUP BY UPPER(r."platformName")`;

    // D) Aging de lo pendiente HOY (snapshot actual, no filtrado por período): estas CxC
    // no tienen dueDate, así que se mide la antigüedad desde la creación.
    const aging = await this.prisma.$queryRaw<any[]>`
      SELECT platform,
        SUM(CASE WHEN age <= 30 THEN bal ELSE 0 END)::float8 AS "b0_30",
        SUM(CASE WHEN age > 30 AND age <= 60 THEN bal ELSE 0 END)::float8 AS "b31_60",
        SUM(CASE WHEN age > 60 AND age <= 90 THEN bal ELSE 0 END)::float8 AS "b61_90",
        SUM(CASE WHEN age > 90 THEN bal ELSE 0 END)::float8 AS "b90"
      FROM (
        SELECT UPPER("platformName") AS platform,
          ("amountUsd" - "paidAmountUsd") AS bal,
          EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 86400 AS age
        FROM "Receivable"
        WHERE type = 'FINANCING_PLATFORM'
          AND UPPER("platformName") IN ('CASHEA', 'CREDIAGRO')
          AND ("amountUsd" - "paidAmountUsd") > 0.01
      ) s GROUP BY platform`;

    // E) Tendencia mensual de ventas (agrupada por mes-calendario Caracas)
    const monthlyRows = await this.prisma.$queryRaw<any[]>`
      SELECT to_char(r."createdAt" AT TIME ZONE 'America/Caracas', 'YYYY-MM') AS ym,
        UPPER(r."platformName") AS platform,
        SUM(r."amountUsd")::float8 AS "salesUsd"
      FROM "Receivable" r
      WHERE r.type = 'FINANCING_PLATFORM'
        AND UPPER(r."platformName") IN ('CASHEA', 'CREDIAGRO')
        AND r."createdAt" >= ${start} AND r."createdAt" <= ${end}
      GROUP BY ym, UPPER(r."platformName")
      ORDER BY ym`;

    // F) Total de ventas de la empresa en el período (para el peso de las plataformas).
    // MISMA definición que el dashboard (`getSales`): status PAID/PARTIAL_RETURN (excluye
    // devueltas y aparcadas) por `paidAt` → el denominador cuadra con "Ventas" del dashboard.
    const companyRows = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS "totalInvoices",
        COALESCE(SUM(i."totalUsd"), 0)::float8 AS "totalSalesUsd",
        COALESCE(SUM(i."totalBs"), 0)::float8 AS "totalSalesBs"
      FROM "Invoice" i
      WHERE i.status IN ('PAID', 'PARTIAL_RETURN')
        AND i."paidAt" >= ${start} AND i."paidAt" <= ${end}`;

    // G) Valor completo de las FACTURAS que usaron cada plataforma (no el financiado, sino
    // la venta entera). Misma definición que F (paidAt, PAID/PARTIAL_RETURN) para que el share
    // sea consistente. DISTINCT por factura para no duplicar si tuviera 2 CxC de la plataforma.
    const share = await this.prisma.$queryRaw<any[]>`
      SELECT platform,
        COUNT(*)::int AS "invoicesCount",
        COALESCE(SUM("totalUsd"), 0)::float8 AS "invoiceValueUsd",
        COALESCE(SUM("totalBs"), 0)::float8 AS "invoiceValueBs"
      FROM (
        SELECT DISTINCT UPPER(r."platformName") AS platform, i.id, i."totalUsd", i."totalBs"
        FROM "Receivable" r
        JOIN "Invoice" i ON i.id = r."invoiceId"
        WHERE r.type = 'FINANCING_PLATFORM'
          AND UPPER(r."platformName") IN ('CASHEA', 'CREDIAGRO')
          AND i.status IN ('PAID', 'PARTIAL_RETURN')
          AND i."paidAt" >= ${start} AND i."paidAt" <= ${end}
      ) t GROUP BY platform`;

    const company = {
      totalInvoices: companyRows[0]?.totalInvoices || 0,
      totalSalesUsd: r2(companyRows[0]?.totalSalesUsd || 0),
      totalSalesBs: r2(companyRows[0]?.totalSalesBs || 0),
    };

    const aggMap = new Map(agg.map((x) => [x.platform, x]));
    const fullMap = new Map(full.map((x) => [x.platform, x]));
    const firstMap = new Map(first.map((x) => [x.platform, x]));
    const agingMap = new Map(aging.map((x) => [x.platform, x]));
    const shareMap = new Map(share.map((x) => [x.platform, x]));

    const platforms = PLATFORMS.map((key) => {
      const a = aggMap.get(key);
      const f = fullMap.get(key);
      const fp = firstMap.get(key);
      const ag = agingMap.get(key);
      const sh = shareMap.get(key);
      const invoicesCount = sh ? sh.invoicesCount : 0;
      const invoiceValueUsd = sh ? sh.invoiceValueUsd : 0;
      const salesUsd = a ? a.salesUsd : 0;
      const collectedUsd = a ? a.collectedUsd : 0;
      const invoiceBaseUsd = a ? a.invoiceBaseUsd : 0;
      const financedBaseUsd = a ? a.financedBaseUsd : 0;
      const avgFinancedPct = a ? a.avgFinancedPct : 0;
      const weightedFinancedPct =
        invoiceBaseUsd > 0 ? (financedBaseUsd / invoiceBaseUsd) * 100 : 0;
      return {
        platform: key,
        salesCount: a ? a.salesCount : 0,
        salesUsd: r2(salesUsd),
        salesBs: r2(a ? a.salesBs : 0),
        collectedUsd: r2(collectedUsd),
        collectedBs: r2(a ? a.collectedBs : 0),
        pendingUsd: r2(a ? a.pendingUsd : 0),
        pendingBs: r2(a ? a.pendingBs : 0),
        collectionRatio: salesUsd > 0 ? r1((collectedUsd / salesUsd) * 100) : 0,
        avgFinancedPct: r1(avgFinancedPct),
        weightedFinancedPct: r1(weightedFinancedPct),
        avgInitialPct: r1(100 - avgFinancedPct),
        avgDaysToFirst: fp && fp.avgDaysToFirst != null ? r1(fp.avgDaysToFirst) : null,
        withPaymentCount: fp ? fp.withPaymentCount : 0,
        avgDaysToFull: f && f.avgDaysToFull != null ? r1(f.avgDaysToFull) : null,
        paidCount: f ? f.paidCount : 0,
        aging: {
          d0_30: r2(ag ? ag.b0_30 : 0),
          d31_60: r2(ag ? ag.b31_60 : 0),
          d61_90: r2(ag ? ag.b61_90 : 0),
          d90plus: r2(ag ? ag.b90 : 0),
        },
        // Peso de la plataforma en las ventas de la empresa (valor completo de la factura)
        invoicesCount,
        invoiceValueUsd: r2(invoiceValueUsd),
        invoiceValueBs: r2(sh ? sh.invoiceValueBs : 0),
        shareByCount: company.totalInvoices > 0 ? r1((invoicesCount / company.totalInvoices) * 100) : 0,
        shareByValue: company.totalSalesUsd > 0 ? r1((invoiceValueUsd / company.totalSalesUsd) * 100) : 0,
      };
    });

    // Serie mensual: un objeto por mes con el monto de cada plataforma
    const monthMap = new Map<string, any>();
    for (const row of monthlyRows) {
      if (!monthMap.has(row.ym)) monthMap.set(row.ym, { ym: row.ym, CASHEA: 0, CREDIAGRO: 0 });
      monthMap.get(row.ym)[row.platform] = r2(row.salesUsd);
    }
    const monthly = Array.from(monthMap.values()).sort((x, y) => x.ym.localeCompare(y.ym));

    return {
      from: from || null,
      to: to || null,
      company,
      platforms,
      monthly,
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
