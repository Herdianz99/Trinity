import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRetentionVoucherDto } from './dto/create-retention-voucher.dto';
import { UpdateRetentionVoucherDto } from './dto/update-retention-voucher.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class RetentionVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeDetail = {
    supplier: { select: { id: true, name: true, rif: true } },
    serie: { select: { id: true, prefix: true, name: true } },
    lines: {
      include: {
        purchaseOrder: {
          select: {
            id: true,
            number: true,
            purchaseNumber: true,
            invoiceDate: true,
            totalIvaUsd: true,
            totalIvaBs: true,
            totalUsd: true,
            totalBs: true,
            exchangeRate: true,
            supplierControlNumber: true,
            supplierInvoiceNumber: true,
          },
        },
        payable: {
          select: {
            id: true, number: true, documentNumber: true, originalDate: true,
            totalIvaUsd: true, totalIvaBs: true, amountUsd: true, amountBs: true,
            exchangeRate: true, controlFiscal: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' as const },
    },
    createdBy: { select: { id: true, name: true } },
  };

  async findAll(query: {
    status?: string;
    supplierId?: string;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;

    if (query.from || query.to) {
      // Filtrar por fecha de EMISION (issueDate), igual que el libro de compras (que filtra por
      // entryDate = fecha de declaracion). issueDate es fecha fiscal date-only a medianoche UTC, asi
      // que se usan limites UTC (NO Caracas). Los comprobantes PENDIENTES (issueDate null) no entran
      // en un rango de fechas (aun no estan declarados), igual que no aparecen en el libro.
      where.issueDate = {};
      if (query.from) {
        const f = new Date(query.from);
        f.setUTCHours(0, 0, 0, 0);
        where.issueDate.gte = f;
      }
      if (query.to) {
        const t = new Date(query.to);
        t.setUTCHours(23, 59, 59, 999);
        where.issueDate.lte = t;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.retentionVoucher.findMany({
        where,
        skip,
        take: limit,
        // Ordenar por correlativo (el number es de ancho fijo YYYYMM+8, asi que
        // el orden de texto = orden numerico). Tras renumerar retenciones, createdAt
        // dejaba la lista desordenada respecto al correlativo.
        orderBy: { number: 'desc' },
        include: this.includeDetail,
      }),
      this.prisma.retentionVoucher.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const voucher = await this.prisma.retentionVoucher.findUnique({
      where: { id },
      include: this.includeDetail,
    });
    if (!voucher)
      throw new NotFoundException('Comprobante de retención no encontrado');
    return voucher;
  }

  async create(dto: CreateRetentionVoucherDto, userId: string) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Debe incluir al menos una factura en el comprobante',
      );
    }

    // Validate supplier exists
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier)
      throw new NotFoundException('Proveedor no encontrado');

    // Load default retention %
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const defaultPct = dto.retentionPct ?? config?.ivaRetentionPct ?? 75;

    // Resolver cada linea a un documento: factura de compra (FC) o cuenta por pagar (CxP)
    const resolved = await Promise.all(dto.lines.map(async (l) => {
      if (l.purchaseOrderId) {
        const po = await this.prisma.purchaseOrder.findUnique({ where: { id: l.purchaseOrderId } });
        if (!po) throw new BadRequestException('Factura de compra no encontrada');
        if (po.supplierId !== dto.supplierId) throw new BadRequestException(`La factura ${po.number} no pertenece al proveedor seleccionado`);
        if (po.status !== 'PROCESSED') throw new BadRequestException(`La factura ${po.number} no está procesada`);
        return { line: l, kind: 'PO' as const, id: po.id, totalUsd: po.totalUsd, totalBs: po.totalBs, ivaUsd: po.totalIvaUsd, ivaBs: po.totalIvaBs, exchangeRate: po.exchangeRate, invoiceDate: po.invoiceDate, controlNumber: po.supplierControlNumber, invoiceNumber: po.supplierInvoiceNumber };
      }
      if (l.payableId) {
        const p = await this.prisma.payable.findUnique({ where: { id: l.payableId } });
        if (!p) throw new BadRequestException('Cuenta por pagar no encontrada');
        if (p.supplierId !== dto.supplierId) throw new BadRequestException(`La CxP ${p.number} no pertenece al proveedor seleccionado`);
        return { line: l, kind: 'PAY' as const, id: p.id, totalUsd: p.amountUsd, totalBs: p.amountBs, ivaUsd: p.totalIvaUsd, ivaBs: p.totalIvaBs, exchangeRate: p.exchangeRate, invoiceDate: p.originalDate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }
      throw new BadRequestException('Cada linea debe referir una factura de compra o una CxP');
    }));

    // No duplicar en un comprobante IVA activo (FC o CxP)
    const poIds = resolved.filter((rr) => rr.kind === 'PO').map((rr) => rr.id);
    const payIds = resolved.filter((rr) => rr.kind === 'PAY').map((rr) => rr.id);
    const existingLines = await this.prisma.retentionVoucherLine.findMany({
      where: {
        retentionVoucher: { status: { not: 'CANCELLED' } },
        OR: [{ purchaseOrderId: { in: poIds } }, { payableId: { in: payIds } }],
      },
      select: { retentionVoucher: { select: { number: true } } },
    });
    if (existingLines.length > 0) {
      const nums = existingLines.map((l) => l.retentionVoucher.number).join(', ');
      throw new BadRequestException(
        `Algunos documentos ya tienen retención IVA activa: ${nums}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Generate voucher number
      const { number, nextSeq } = await this.generateNumber(tx);

      // Build lines and accumulate totals
      let totalRetUsd = 0;
      let totalRetBs = 0;
      let headerExchangeRate = 0;

      const lineData: any[] = [];

      for (const rdoc of resolved) {
        const linePct = rdoc.line.retentionPct ?? defaultPct;
        const isManual = rdoc.line.isManual ?? false;

        let retUsd: number;
        let retBs: number;

        if (isManual && rdoc.line.retentionAmountUsd != null) {
          retUsd = round2(rdoc.line.retentionAmountUsd);
          retBs =
            rdoc.line.retentionAmountBs != null
              ? round2(rdoc.line.retentionAmountBs)
              : round2(retUsd * rdoc.exchangeRate);
        } else {
          retUsd = round2(rdoc.ivaUsd * (linePct / 100));
          retBs = round2(rdoc.ivaBs * (linePct / 100));
        }

        // taxable base = total - IVA
        const taxBaseUsd = round2(rdoc.totalUsd - rdoc.ivaUsd);
        const taxBaseBs = round2(rdoc.totalBs - rdoc.ivaBs);

        totalRetUsd += retUsd;
        totalRetBs += retBs;
        if (!headerExchangeRate) headerExchangeRate = rdoc.exchangeRate;

        lineData.push({
          purchaseOrderId: rdoc.kind === 'PO' ? rdoc.id : null,
          payableId: rdoc.kind === 'PAY' ? rdoc.id : null,
          supplierInvoiceNumber: rdoc.invoiceNumber,
          supplierControlNumber: rdoc.controlNumber,
          invoiceDate: rdoc.invoiceDate,
          invoiceTotalUsd: rdoc.totalUsd,
          invoiceTotalBs: rdoc.totalBs,
          taxableBaseUsd: taxBaseUsd,
          taxableBaseBs: taxBaseBs,
          ivaAmountUsd: rdoc.ivaUsd,
          ivaAmountBs: rdoc.ivaBs,
          retentionPct: linePct,
          retentionAmountUsd: retUsd,
          retentionAmountBs: retBs,
          exchangeRate: rdoc.exchangeRate,
          isManual,
        });
      }

      const voucher = await tx.retentionVoucher.create({
        data: {
          number,
          supplierId: dto.supplierId,
          serieId: dto.serieId || null,
          status: 'PENDING',
          retentionPct: defaultPct,
          retentionAmountUsd: round2(totalRetUsd),
          retentionAmountBs: round2(totalRetBs),
          exchangeRate: headerExchangeRate,
          notes: dto.notes || null,
          createdById: userId,
          lines: { create: lineData },
        },
        include: this.includeDetail,
      });

      // Increment global retention sequence
      await tx.companyConfig.update({
        where: { id: 'singleton' },
        data: { retentionNextNumber: nextSeq },
      });

      return voucher;
    });
  }

  async update(id: string, dto: UpdateRetentionVoucherDto, userId: string) {
    const voucher = await this.findOne(id);
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se pueden editar comprobantes en estado PENDIENTE',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // If lines provided, replace all lines
      if (dto.lines && dto.lines.length > 0) {
        // Validate POs
        const poIds = dto.lines.map((l) => l.purchaseOrderId);
        const orders = await tx.purchaseOrder.findMany({
          where: { id: { in: poIds } },
          select: {
            id: true,
            number: true,
            supplierId: true,
            status: true,
            totalIvaUsd: true,
            totalIvaBs: true,
            totalUsd: true,
            totalBs: true,
            exchangeRate: true,
            invoiceDate: true,
            supplierControlNumber: true,
            supplierInvoiceNumber: true,
          },
        });

        if (orders.length !== poIds.length) {
          throw new BadRequestException('Una o más facturas no existen');
        }

        // Check no PO is in another active voucher (excluding this one)
        const existingLines = await tx.retentionVoucherLine.findMany({
          where: {
            purchaseOrderId: { in: poIds },
            retentionVoucherId: { not: id },
            retentionVoucher: { status: { not: 'CANCELLED' } },
          },
          select: {
            purchaseOrderId: true,
            retentionVoucher: { select: { number: true } },
          },
        });
        if (existingLines.length > 0) {
          const nums = existingLines
            .map((l) => l.retentionVoucher.number)
            .join(', ');
          throw new BadRequestException(
            `Algunas facturas ya tienen retención activa: ${nums}`,
          );
        }

        // Delete old lines
        await tx.retentionVoucherLine.deleteMany({
          where: { retentionVoucherId: id },
        });

        const config = await tx.companyConfig.findUnique({
          where: { id: 'singleton' },
        });
        const defaultPct =
          dto.retentionPct ?? voucher.retentionPct ?? config?.ivaRetentionPct ?? 75;

        const ordersMap = new Map(orders.map((o) => [o.id, o]));
        let totalRetUsd = 0;
        let totalRetBs = 0;
        let headerExchangeRate = voucher.exchangeRate;

        for (const lineDto of dto.lines) {
          const po = ordersMap.get(lineDto.purchaseOrderId)!;
          const linePct = lineDto.retentionPct ?? defaultPct;
          const isManual = lineDto.isManual ?? false;

          let retUsd: number;
          let retBs: number;

          if (isManual && lineDto.retentionAmountUsd != null) {
            retUsd = round2(lineDto.retentionAmountUsd);
            retBs =
              lineDto.retentionAmountBs != null
                ? round2(lineDto.retentionAmountBs)
                : round2(retUsd * po.exchangeRate);
          } else {
            retUsd = round2(po.totalIvaUsd * (linePct / 100));
            retBs = round2(po.totalIvaBs * (linePct / 100));
          }

          const taxBaseUsd = round2(po.totalUsd - po.totalIvaUsd);
          const taxBaseBs = round2(po.totalBs - po.totalIvaBs);

          totalRetUsd += retUsd;
          totalRetBs += retBs;
          if (!headerExchangeRate) headerExchangeRate = po.exchangeRate;

          await tx.retentionVoucherLine.create({
            data: {
              retentionVoucherId: id,
              purchaseOrderId: po.id,
              supplierInvoiceNumber: po.supplierInvoiceNumber,
              supplierControlNumber: po.supplierControlNumber,
              invoiceDate: po.invoiceDate,
              invoiceTotalUsd: po.totalUsd,
              invoiceTotalBs: po.totalBs,
              taxableBaseUsd: taxBaseUsd,
              taxableBaseBs: taxBaseBs,
              ivaAmountUsd: po.totalIvaUsd,
              ivaAmountBs: po.totalIvaBs,
              retentionPct: linePct,
              retentionAmountUsd: retUsd,
              retentionAmountBs: retBs,
              exchangeRate: po.exchangeRate,
              isManual,
            },
          });
        }

        return tx.retentionVoucher.update({
          where: { id },
          data: {
            retentionPct: defaultPct,
            retentionAmountUsd: round2(totalRetUsd),
            retentionAmountBs: round2(totalRetBs),
            exchangeRate: headerExchangeRate,
            serieId: dto.serieId !== undefined ? dto.serieId || null : undefined,
            notes: dto.notes !== undefined ? dto.notes || null : undefined,
          },
          include: this.includeDetail,
        });
      }

      // If no lines, just update header fields
      return tx.retentionVoucher.update({
        where: { id },
        data: {
          retentionPct: dto.retentionPct ?? undefined,
          serieId: dto.serieId !== undefined ? dto.serieId || null : undefined,
          notes: dto.notes !== undefined ? dto.notes || null : undefined,
        },
        include: this.includeDetail,
      });
    });
  }

  async issue(id: string, issueDate: string, userId: string) {
    const voucher = await this.findOne(id);
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se pueden emitir comprobantes en estado PENDIENTE',
      );
    }

    const issueDateObj = new Date(issueDate);

    return this.prisma.$transaction(async (tx) => {
      // Update voucher status
      const updated = await tx.retentionVoucher.update({
        where: { id },
        data: {
          status: 'ISSUED',
          issueDate: issueDateObj,
        },
        include: this.includeDetail,
      });

      // Create one purchase book entry per line (retention line with negative amount)
      for (const line of updated.lines) {
        await tx.purchaseBookEntry.create({
          data: {
            purchaseOrderId: line.purchaseOrderId || null,
            payableId: line.payableId || null,
            entryDate: issueDateObj,
            supplierControlNumber: line.supplierControlNumber || null,
            supplierInvoiceNumber: line.supplierInvoiceNumber || null,
            supplierName: updated.supplier.name,
            supplierRif: updated.supplier.rif || 'S/R',
            retentionVoucherNumber: updated.number,
            retentionAmountBs: line.retentionAmountBs,
            totalBs: round2(-line.retentionAmountBs),
            isRetentionLine: true,
            retentionVoucherId: updated.id,
            isManual: false,
            createdById: userId,
          },
        });
      }

      return updated;
    });
  }

  async cancel(id: string) {
    const voucher = await this.findOne(id);
    if (voucher.status === 'CANCELLED') {
      throw new BadRequestException('El comprobante ya está anulado');
    }

    return this.prisma.$transaction(async (tx) => {
      // If ISSUED, remove the book entry lines
      if (voucher.status === 'ISSUED') {
        await tx.purchaseBookEntry.deleteMany({
          where: { retentionVoucherId: id, isRetentionLine: true },
        });
      }

      return tx.retentionVoucher.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: this.includeDetail,
      });
    });
  }

  /** Get pending POs for a supplier that don't have an active retention voucher */
  async getAvailablePurchaseOrders(supplierId: string) {
    // Get PO IDs already in active retention vouchers
    const usedLines = await this.prisma.retentionVoucherLine.findMany({
      where: {
        retentionVoucher: {
          supplierId,
          status: { not: 'CANCELLED' },
        },
      },
      select: { purchaseOrderId: true },
    });
    const usedPoIds = usedLines.map((l) => l.purchaseOrderId).filter((id): id is string => id !== null);

    return this.prisma.purchaseOrder.findMany({
      where: {
        supplierId,
        status: 'PROCESSED',
        totalIvaUsd: { gt: 0 },
        ...(usedPoIds.length > 0 ? { id: { notIn: usedPoIds } } : {}),
      },
      select: {
        id: true,
        number: true,
        purchaseNumber: true,
        invoiceDate: true,
        totalIvaUsd: true,
        totalIvaBs: true,
        totalUsd: true,
        totalBs: true,
        exchangeRate: true,
        supplierControlNumber: true,
        supplierInvoiceNumber: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async getPdfData(id: string) {
    return this.findOne(id);
  }

  /** FCs procesadas + CxP fiscales con IVA, sin retencion IVA activa, del proveedor. */
  async getAvailableDocuments(supplierId: string) {
    const usedLines = await this.prisma.retentionVoucherLine.findMany({
      where: { retentionVoucher: { supplierId, status: { not: 'CANCELLED' } } },
      select: { purchaseOrderId: true, payableId: true },
    });
    const usedPo = usedLines.map((l) => l.purchaseOrderId).filter((x): x is string => !!x);
    const usedPay = usedLines.map((l) => l.payableId).filter((x): x is string => !!x);

    const [orders, payables] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { supplierId, status: 'PROCESSED', totalIvaUsd: { gt: 0 }, ...(usedPo.length ? { id: { notIn: usedPo } } : {}) },
        select: { id: true, number: true, invoiceDate: true, totalIvaUsd: true, totalIvaBs: true, totalUsd: true, totalBs: true, exchangeRate: true, supplierControlNumber: true, supplierInvoiceNumber: true },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.payable.findMany({
        where: { supplierId, totalIvaUsd: { gt: 0 }, serie: { isFiscal: true }, ...(usedPay.length ? { id: { notIn: usedPay } } : {}) },
        select: { id: true, number: true, documentNumber: true, originalDate: true, totalIvaUsd: true, totalIvaBs: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return [
      ...orders.map((o) => ({ docType: 'PURCHASE_ORDER' as const, id: o.id, number: o.number, invoiceDate: o.invoiceDate, ivaUsd: o.totalIvaUsd, ivaBs: o.totalIvaBs, totalUsd: o.totalUsd, totalBs: o.totalBs, exchangeRate: o.exchangeRate, controlNumber: o.supplierControlNumber, invoiceNumber: o.supplierInvoiceNumber })),
      ...payables.map((p) => ({ docType: 'PAYABLE' as const, id: p.id, number: p.documentNumber || p.number, invoiceDate: p.originalDate, ivaUsd: p.totalIvaUsd, ivaBs: p.totalIvaBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber })),
    ];
  }

  // Generate next retention number YYYYMM + 8-digit global sequence
  // Normaliza un RIF al formato SENIAT: letra + 9 digitos, sin guiones (J-40990760-0 -> J409907600)
  private normalizeRif(rif?: string | null): string {
    if (!rif) return '';
    const clean = rif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const m = clean.match(/^([A-Z]?)(\d+)$/);
    if (!m) return clean;
    const letter = m[1] || 'J';
    return `${letter}${m[2].padStart(9, '0')}`;
  }

  // TXT de retenciones de IVA (compras) para el portal SENIAT — declaracion quincenal.
  // Una fila por factura (RetentionVoucherLine), TAB-separado, montos en Bs con punto decimal.
  async generateRetentionTxt(
    from: string,
    to: string,
  ): Promise<{ content: string; filename: string }> {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const agentRif = this.normalizeRif(config?.rif);

    // Comprobantes emitidos en el rango, por FECHA DE EMISION (issueDate) — igual que el libro de
    // compras (entryDate). Antes se filtraba por fecha de factura (invoiceDate), lo que dejaba fuera
    // retenciones de facturas de un mes declaradas en una quincena posterior (no cuadraba con el libro).
    // Se incluyen TODAS las lineas del comprobante (todas se declaran en el mismo periodo).
    const vouchers = await this.prisma.retentionVoucher.findMany({
      where: {
        status: 'ISSUED',
        issueDate: { gte: fromDate, lte: toDate },
      },
      include: {
        supplier: { select: { rif: true } },
        lines: {
          orderBy: { invoiceDate: 'desc' },
        },
      },
      orderBy: { number: 'desc' },
    });

    const period = `${fromDate.getUTCFullYear()}${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}`;

    const rows: string[] = [];
    for (const v of vouchers) {
      const supplierRif = this.normalizeRif(v.supplier?.rif);
      for (const line of v.lines) {
        const total = round2(line.invoiceTotalBs);
        const base = round2(line.taxableBaseBs);
        const iva = round2(line.ivaAmountBs);
        const retenido = round2(line.retentionAmountBs);
        const exento = round2(total - base - iva);
        const fecha = line.invoiceDate
          ? line.invoiceDate.toISOString().slice(0, 10)
          : '';
        // Tipo de documento: 01 factura (por defecto). Para notas: 02 nota debito,
        // 03 nota credito; en ese caso col 12 lleva el N° de factura afectada y los
        // montos de una nota de credito van en negativo. Hoy los comprobantes solo
        // se arman desde facturas, asi que todas salen como 01 / afectada 0.
        const docType = '01';
        const affected = '0';
        rows.push(
          [
            agentRif,
            period,
            fecha,
            'C',
            docType,
            supplierRif,
            line.supplierInvoiceNumber || '',
            line.supplierControlNumber || '',
            total.toFixed(2),
            base.toFixed(2),
            retenido.toFixed(2),
            affected,
            v.number,
            exento.toFixed(2),
            '16',
            '0',
          ].join('\t'),
        );
      }
    }

    const content = rows.length ? rows.join('\r\n') + '\r\n' : '';
    const quincena = fromDate.getUTCDate() <= 15 ? 'Q1' : 'Q2';
    const filename = `retenciones_iva_${period}_${quincena}.txt`;
    return { content, filename };
  }

  async generateNumber(tx: any): Promise<{ number: string; nextSeq: number }> {
    const now = new Date();
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const config = await tx.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const seq = config?.retentionNextNumber || 1;
    return {
      number: `${prefix}${String(seq).padStart(8, '0')}`,
      nextSeq: seq + 1,
    };
  }
}
