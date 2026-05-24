import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class RetentionVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeDetail = {
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
        supplier: { select: { id: true, name: true, rif: true } },
      },
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

    if (query.supplierId) {
      where.purchaseOrder = { supplierId: query.supplierId };
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
    if (!voucher) throw new NotFoundException('Comprobante de retención no encontrado');
    return voucher;
  }

  async issue(id: string, issueDate: string, userId: string) {
    const voucher = await this.findOne(id);
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException('Solo se pueden emitir comprobantes en estado PENDIENTE');
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

      // Create retention line in purchase book
      const po = updated.purchaseOrder;
      await tx.purchaseBookEntry.create({
        data: {
          purchaseOrderId: po.id,
          entryDate: issueDateObj,
          supplierControlNumber: po.supplierControlNumber || null,
          supplierInvoiceNumber: po.supplierInvoiceNumber || null,
          supplierName: po.supplier.name,
          supplierRif: po.supplier.rif || 'S/R',
          retentionVoucherNumber: updated.number,
          retentionAmountBs: updated.retentionAmountBs,
          totalBs: round2(-updated.retentionAmountBs),
          isRetentionLine: true,
          retentionVoucherId: updated.id,
          isManual: false,
          createdById: userId,
        },
      });

      return updated;
    });
  }

  async cancel(id: string) {
    const voucher = await this.findOne(id);
    if (voucher.status === 'CANCELLED') {
      throw new BadRequestException('El comprobante ya está anulado');
    }

    return this.prisma.$transaction(async (tx) => {
      // If ISSUED, remove the book entry line
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

  async getPdfData(id: string) {
    const voucher = await this.findOne(id);
    return voucher;
  }

  // Generate next retention number RET-XXXX with SELECT FOR UPDATE
  async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw`
      SELECT COALESCE(
        (SELECT MAX(CAST(SUBSTRING("number" FROM 5) AS INTEGER)) FROM "RetentionVoucher"),
        0
      ) as max_num
    `;
    const next = (result as any[])[0].max_num + 1;
    return `RET-${String(next).padStart(4, '0')}`;
  }
}
