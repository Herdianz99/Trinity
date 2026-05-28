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

    const [data, total] = await Promise.all([
      this.prisma.retentionVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

    // Validate all POs belong to the same supplier and are processed
    const poIds = dto.lines.map((l) => l.purchaseOrderId);
    const orders = await this.prisma.purchaseOrder.findMany({
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
      throw new BadRequestException(
        'Una o más facturas no existen',
      );
    }

    for (const po of orders) {
      if (po.supplierId !== dto.supplierId) {
        throw new BadRequestException(
          `La factura ${po.number} no pertenece al proveedor seleccionado`,
        );
      }
      if (po.status !== 'PROCESSED') {
        throw new BadRequestException(
          `La factura ${po.number} no está procesada`,
        );
      }
    }

    // Check no PO is already in another active retention voucher
    const existingLines = await this.prisma.retentionVoucherLine.findMany({
      where: {
        purchaseOrderId: { in: poIds },
        retentionVoucher: { status: { not: 'CANCELLED' } },
      },
      select: { purchaseOrderId: true, retentionVoucher: { select: { number: true } } },
    });
    if (existingLines.length > 0) {
      const nums = existingLines.map((l) => l.retentionVoucher.number).join(', ');
      throw new BadRequestException(
        `Algunas facturas ya tienen retención activa: ${nums}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Generate voucher number
      const { number, nextSeq } = await this.generateNumber(tx);

      // Build lines and accumulate totals
      let totalRetUsd = 0;
      let totalRetBs = 0;
      let headerExchangeRate = 0;

      const ordersMap = new Map(orders.map((o) => [o.id, o]));
      const lineData: any[] = [];

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

        // taxable base = total - IVA
        const taxBaseUsd = round2(po.totalUsd - po.totalIvaUsd);
        const taxBaseBs = round2(po.totalBs - po.totalIvaBs);

        totalRetUsd += retUsd;
        totalRetBs += retBs;
        if (!headerExchangeRate) headerExchangeRate = po.exchangeRate;

        lineData.push({
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
            purchaseOrderId: line.purchaseOrderId,
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
    const usedPoIds = usedLines.map((l) => l.purchaseOrderId);

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

  // Generate next retention number YYYYMM + 8-digit global sequence
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
