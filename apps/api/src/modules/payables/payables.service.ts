import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryPayablesDto } from './dto/query-payables.dto';
import { CreatePayableDto } from './dto/create-payable.dto';

@Injectable()
export class PayablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Eliminar una CxP manual (no proveniente de factura de compra) si no fue cruzada/pagada.
  async remove(id: string) {
    const p = await this.prisma.payable.findUnique({
      where: { id },
      include: { payments: true, receiptItems: true, paymentScheduleItems: true },
    });
    if (!p) throw new NotFoundException('Cuenta por pagar no encontrada');
    if (p.purchaseOrderId) {
      throw new BadRequestException('Solo se pueden eliminar CxP manuales; las de una factura de compra se gestionan desde la factura');
    }
    if (p.status === 'PAID' || p.status === 'PARTIAL' || (p.paidAmountUsd || 0) > 0 || p.payments.length > 0 || p.receiptItems.length > 0) {
      throw new BadRequestException('No se puede eliminar: la CxP ya fue cruzada o pagada en un recibo');
    }
    if (p.paymentScheduleItems.length > 0) {
      throw new BadRequestException('No se puede eliminar: la CxP esta incluida en una programacion de pagos');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseBookEntry.deleteMany({ where: { payableId: id } });
      await tx.payable.delete({ where: { id } });
    });
    return { message: 'Cuenta por pagar eliminada' };
  }

  async create(dto: CreatePayableDto, userId?: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) throw new BadRequestException('No hay tasa de cambio registrada para hoy');

    // Resolve serie and fiscal status
    let serie: any = null;
    let isFiscal = false;
    if (dto.serieId) {
      serie = await this.prisma.serie.findUnique({ where: { id: dto.serieId } });
      if (!serie) throw new BadRequestException('Serie no encontrada');
      if (serie.type !== 'PURCHASES') throw new BadRequestException('La serie debe ser de tipo COMPRAS');
      isFiscal = serie.isFiscal;
    }

    const currency = dto.currency || 'USD';
    const r = rate.rate;

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

    // For manual CxP, retention is handled as a separate document
    const retentionUsd = 0;
    const retentionBs = 0;
    const netPayableUsd = amountUsd;
    const netPayableBs = amountBs;

    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    const originalDate = dto.originalDate ? new Date(dto.originalDate) : null;
    const receptionDate = dto.receptionDate ? new Date(dto.receptionDate) : null;

    return this.prisma.$transaction(async (tx) => {
      // Generate correlative number
      const config = await tx.companyConfig.findUnique({
        where: { id: 'singleton' },
      });
      // @ts-ignore - field just added
      const nextNum = config?.payableNextNumber || 1;
      const yearSuffix = new Date().getFullYear().toString().slice(-2);
      const number = `CXP/${yearSuffix}-${nextNum.toString().padStart(6, '0')}`;

      await tx.companyConfig.update({
        where: { id: 'singleton' },
        data: { payableNextNumber: nextNum + 1 } as any,
      });

      const payable = await tx.payable.create({
        data: {
          number,
          supplierId: dto.supplierId,
          purchaseOrderId: null,
          documentNumber: dto.documentNumber || null,
          description: dto.description || null,
          amountUsd,
          amountBs,
          exchangeRate: r,
          retentionUsd,
          retentionBs,
          netPayableUsd,
          netPayableBs,
          dueDate,
          notes: dto.notes || null,
          serieId: dto.serieId || null,
          serieProveedor: dto.serie || null,
          controlFiscal: dto.controlFiscal || null,
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
          supplier: { select: { id: true, name: true, rif: true } },
          serie: { select: { id: true, name: true, isFiscal: true } },
        },
      });

      // If fiscal (determined by serie), create PurchaseBookEntry
      if (isFiscal && userId) {
        const totalBsForBook = toBs(total);
        const exemptBs = toBs(exemptBase);
        const taxableBs = toBs(taxableBase8 + taxableBase16 + taxableBase31);
        const ivaBs = toBs(totalIva);

        await tx.purchaseBookEntry.create({
          data: {
            payableId: payable.id,
            entryDate: originalDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierSerie: dto.serie || null,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: exemptBs,
            taxableBaseBs: taxableBs,
            ivaAmountBs: ivaBs,
            totalBs: totalBsForBook,
            isManual: true,
            createdById: userId,
          },
        });
      }

      // If createRetention requested and fiscal, create RetentionVoucher
      if (dto.createRetention && isFiscal && userId && totalIva > 0) {
        const retPct = dto.retentionPct ?? (config as any)?.ivaRetentionPct ?? 75;

        // Calculate retention amounts
        const totalIvaUsd = toUsd(totalIva);
        const totalIvaBs = toBs(totalIva);
        const retAmountUsd = Math.round(totalIvaUsd * (retPct / 100) * 100) / 100;
        const retAmountBs = Math.round(totalIvaBs * (retPct / 100) * 100) / 100;

        // Generate retention number: YYYYMM + padded seq
        const retNextNum = (config as any)?.retentionNextNumber || 1;
        const now = new Date();
        const yyyymm = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        const retNumber = `${yyyymm}${retNextNum.toString().padStart(8, '0')}`;

        await tx.companyConfig.update({
          where: { id: 'singleton' },
          data: { retentionNextNumber: retNextNum + 1 } as any,
        });

        // Taxable base for retention line (sum of all taxable bases)
        const taxableBaseTotalCurr = taxableBase8 + taxableBase16 + taxableBase31;

        const retentionVoucher = await tx.retentionVoucher.create({
          data: {
            number: retNumber,
            supplierId: dto.supplierId,
            serieId: dto.serieId || null,
            status: 'ISSUED',
            issueDate: originalDate || new Date(),
            retentionPct: retPct,
            retentionAmountUsd: retAmountUsd,
            retentionAmountBs: retAmountBs,
            exchangeRate: r,
            notes: `Retencion IVA ${retPct}% sobre CxP ${number}`,
            createdById: userId,
            lines: {
              create: {
                payableId: payable.id,
                supplierInvoiceNumber: dto.documentNumber || null,
                supplierControlNumber: dto.controlFiscal || null,
                invoiceDate: originalDate || new Date(),
                invoiceTotalUsd: amountUsd,
                invoiceTotalBs: amountBs,
                taxableBaseUsd: toUsd(taxableBaseTotalCurr),
                taxableBaseBs: toBs(taxableBaseTotalCurr),
                ivaAmountUsd: totalIvaUsd,
                ivaAmountBs: totalIvaBs,
                retentionPct: retPct,
                retentionAmountUsd: retAmountUsd,
                retentionAmountBs: retAmountBs,
                exchangeRate: r,
                isManual: true,
              },
            },
          },
        });

        // Create PurchaseBookEntry for retention (negative line)
        await tx.purchaseBookEntry.create({
          data: {
            retentionVoucherId: retentionVoucher.id,
            payableId: payable.id,
            entryDate: originalDate || new Date(),
            supplierControlNumber: dto.controlFiscal || null,
            supplierInvoiceNumber: dto.documentNumber || number,
            supplierName: supplier.name,
            supplierRif: supplier.rif || '',
            exemptAmountBs: 0,
            taxableBaseBs: 0,
            ivaAmountBs: -retAmountBs,
            totalBs: -retAmountBs,
            isRetentionLine: true,
            isManual: true,
            createdById: userId,
          },
        });

        // Update payable retention fields
        await tx.payable.update({
          where: { id: payable.id },
          data: {
            retentionUsd: retAmountUsd,
            retentionBs: retAmountBs,
            netPayableUsd: Math.round((amountUsd - retAmountUsd) * 100) / 100,
            netPayableBs: Math.round((amountBs - retAmountBs) * 100) / 100,
          },
        });
      }

      return payable;
    });
  }

  async getNextNumber() {
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const nextNum = (config as any)?.payableNextNumber || 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    return { nextNumber: `CXP/${yearSuffix}-${nextNum.toString().padStart(6, '0')}` };
  }

  async findAll(query: QueryPayablesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const from = new Date(query.from);
        from.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = from;
      }
      if (query.to) {
        const to = new Date(query.to);
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (query.overdue) {
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      where.dueDate = { lt: now };
      where.status = { in: ['PENDING', 'PARTIAL'] };
    }

    const [data, total] = await Promise.all([
      this.prisma.payable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          serie: { select: { id: true, name: true, isFiscal: true } },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, amountUsd: true, createdAt: true, receiptId: true, method: { select: { id: true, name: true } }, receipt: { select: { id: true, number: true } } },
          },
        },
      }),
      this.prisma.payable.count({ where }),
    ]);

    const enriched = data.map((p) => ({
      ...p,
      balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
    }));

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrder: {
          select: { id: true, number: true, totalUsd: true, createdAt: true },
        },
        serie: { select: { id: true, name: true, isFiscal: true } },
        retentionVoucherLines: {
          include: {
            retentionVoucher: { select: { id: true, number: true, status: true, retentionAmountUsd: true, retentionAmountBs: true } },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            method: true,
            receipt: { select: { id: true, number: true } },
          },
        },
      },
    });
    if (!payable) throw new NotFoundException('Cuenta por pagar no encontrada');
    return {
      ...payable,
      balanceUsd: Math.round((payable.netPayableUsd - payable.paidAmountUsd) * 100) / 100,
    };
  }

  async summary() {
    const pending = await this.prisma.payable.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });

    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let totalRetentionUsd = 0;
    const supplierMap: Record<string, { supplierName: string; totalUsd: number; count: number }> = {};

    for (const p of pending) {
      const balance = p.netPayableUsd - p.paidAmountUsd;
      totalPendingUsd += balance;

      if (p.status === 'OVERDUE') {
        totalOverdueUsd += balance;
      }

      if (p.retentionUsd > 0) {
        totalRetentionUsd += p.retentionUsd;
      }

      if (!supplierMap[p.supplierId]) {
        supplierMap[p.supplierId] = {
          supplierName: p.supplier.name,
          totalUsd: 0,
          count: 0,
        };
      }
      supplierMap[p.supplierId].totalUsd += balance;
      supplierMap[p.supplierId].count += 1;
    }

    return {
      totalPendingUsd: Math.round(totalPendingUsd * 100) / 100,
      totalOverdueUsd: Math.round(totalOverdueUsd * 100) / 100,
      totalRetentionUsd: Math.round(totalRetentionUsd * 100) / 100,
      supplierCount: Object.keys(supplierMap).length,
      bySupplier: Object.values(supplierMap).map((s) => ({
        supplierName: s.supplierName,
        totalUsd: Math.round(s.totalUsd * 100) / 100,
        count: s.count,
      })),
    };
  }

  async findBySupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const payables = await this.prisma.payable.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseOrder: { select: { id: true, number: true } },
        serie: { select: { id: true, name: true, isFiscal: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, amountUsd: true, createdAt: true, method: { select: { id: true, name: true } } },
        },
      },
    });

    const pending = payables.filter((p) =>
      ['PENDING', 'PARTIAL', 'OVERDUE'].includes(p.status),
    );
    const totalDebt = pending.reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    const totalOverdue = pending
      .filter((p) => p.status === 'OVERDUE')
      .reduce((sum, p) => sum + (p.netPayableUsd - p.paidAmountUsd), 0);
    const totalRetention = pending.reduce((sum, p) => sum + p.retentionUsd, 0);

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        rif: supplier.rif,
        isRetentionAgent: supplier.isRetentionAgent,
      },
      totalDebt: Math.round(totalDebt * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      totalRetention: Math.round(totalRetention * 100) / 100,
      payables: payables.map((p) => ({
        ...p,
        balanceUsd: Math.round((p.netPayableUsd - p.paidAmountUsd) * 100) / 100,
      })),
    };
  }

  async markOverdue(): Promise<number> {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.payable.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      data: { status: 'OVERDUE' },
    });

    return result.count;
  }
}
