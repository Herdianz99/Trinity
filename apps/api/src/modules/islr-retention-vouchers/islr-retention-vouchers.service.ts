import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIslrRetentionVoucherDto } from './dto/create-islr-retention-voucher.dto';
import { UpdateIslrRetentionVoucherDto } from './dto/update-islr-retention-voucher.dto';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class IslrRetentionVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly includeDetail = {
    supplier: { select: { id: true, name: true, rif: true, supplierType: true, islrConceptId: true } },
    serie: { select: { id: true, prefix: true, name: true } },
    lines: {
      include: {
        purchaseOrder: {
          select: {
            id: true,
            number: true,
            purchaseNumber: true,
            invoiceDate: true,
            subtotalUsd: true,
            subtotalBs: true,
            totalUsd: true,
            totalBs: true,
            exchangeRate: true,
            supplierControlNumber: true,
            supplierInvoiceNumber: true,
          },
        },
        islrRetentionType: {
          select: {
            id: true,
            codigo: true,
            descripcion: true,
            baseImponiblePct: true,
            retentionPct: true,
            sustraendoUt: true,
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
        where.createdAt.gte = caracasDayStart(query.from);
      }
      if (query.to) {
        where.createdAt.lte = caracasDayEnd(query.to);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.islrRetentionVoucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.includeDetail,
      }),
      this.prisma.islrRetentionVoucher.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const voucher = await this.prisma.islrRetentionVoucher.findUnique({
      where: { id },
      include: this.includeDetail,
    });
    if (!voucher)
      throw new NotFoundException('Comprobante de retención ISLR no encontrado');
    return voucher;
  }

  async create(dto: CreateIslrRetentionVoucherDto, userId: string) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Debe incluir al menos una factura en el comprobante',
      );
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');

    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const valorUT = config?.unidadTributaria ?? 43;

    // Validate all POs
    const poIds = dto.lines.map((l) => l.purchaseOrderId);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { id: { in: poIds } },
      select: {
        id: true,
        number: true,
        supplierId: true,
        status: true,
        subtotalUsd: true,
        subtotalBs: true,
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

    // Check no PO is already in another active ISLR voucher
    const existingLines = await this.prisma.islrRetentionVoucherLine.findMany({
      where: {
        purchaseOrderId: { in: poIds },
        islrRetentionVoucher: { status: { not: 'CANCELLED' } },
      },
      select: { purchaseOrderId: true, islrRetentionVoucher: { select: { number: true } } },
    });
    if (existingLines.length > 0) {
      const nums = existingLines.map((l) => l.islrRetentionVoucher.number).join(', ');
      throw new BadRequestException(
        `Algunas facturas ya tienen retención ISLR activa: ${nums}`,
      );
    }

    // Load all referenced retention types
    const typeIds = [...new Set(dto.lines.map((l) => l.islrRetentionTypeId))];
    const types = await this.prisma.islrRetentionType.findMany({
      where: { id: { in: typeIds } },
    });
    const typesMap = new Map(types.map((t) => [t.id, t]));

    for (const lineDto of dto.lines) {
      if (!typesMap.has(lineDto.islrRetentionTypeId)) {
        throw new BadRequestException('Tipo de retención ISLR no encontrado');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const { number, nextSeq } = await this.generateNumber(tx);

      let totalRetUsd = 0;
      let totalRetBs = 0;
      let headerExchangeRate = 0;

      const ordersMap = new Map(orders.map((o) => [o.id, o]));
      const lineData: any[] = [];

      for (const lineDto of dto.lines) {
        const po = ordersMap.get(lineDto.purchaseOrderId)!;
        const tipo = typesMap.get(lineDto.islrRetentionTypeId)!;
        const isManual = lineDto.isManual ?? false;

        // Base imponible = subtotal (sin IVA)
        const taxableBaseUsd = po.subtotalUsd;
        const taxableBaseBs = po.subtotalBs;

        let retUsd: number;
        let retBs: number;
        let sustraendoBs = 0;

        if (isManual && lineDto.retentionAmountUsd != null) {
          retUsd = round2(lineDto.retentionAmountUsd);
          retBs =
            lineDto.retentionAmountBs != null
              ? round2(lineDto.retentionAmountBs)
              : round2(retUsd * po.exchangeRate);
        } else {
          // Formula: ret = (base * baseImponiblePct/100 * retentionPct/100) - sustraendo
          const baseAjustadaBs = taxableBaseBs * (tipo.baseImponiblePct / 100);
          const retencionBrutaBs = baseAjustadaBs * (tipo.retentionPct / 100);

          if (tipo.sustraendoUt > 0 && supplier.supplierType === 'NATURAL_RESIDENTE') {
            sustraendoBs = round2(tipo.sustraendoUt * valorUT);
          }

          retBs = Math.max(0, round2(retencionBrutaBs - sustraendoBs));

          // Calculate USD equivalent
          const baseAjustadaUsd = taxableBaseUsd * (tipo.baseImponiblePct / 100);
          const retencionBrutaUsd = baseAjustadaUsd * (tipo.retentionPct / 100);
          const sustraendoUsd = po.exchangeRate > 0 ? round2(sustraendoBs / po.exchangeRate) : 0;
          retUsd = Math.max(0, round2(retencionBrutaUsd - sustraendoUsd));
        }

        totalRetUsd += retUsd;
        totalRetBs += retBs;
        if (!headerExchangeRate) headerExchangeRate = po.exchangeRate;

        lineData.push({
          purchaseOrderId: po.id,
          islrRetentionTypeId: tipo.id,
          supplierInvoiceNumber: po.supplierInvoiceNumber,
          supplierControlNumber: po.supplierControlNumber,
          invoiceDate: po.invoiceDate,
          invoiceTotalUsd: po.totalUsd,
          invoiceTotalBs: po.totalBs,
          taxableBaseUsd,
          taxableBaseBs,
          baseImponiblePct: tipo.baseImponiblePct,
          retentionPct: tipo.retentionPct,
          sustraendoUt: tipo.sustraendoUt,
          sustraendoBs,
          retentionAmountUsd: retUsd,
          retentionAmountBs: retBs,
          exchangeRate: po.exchangeRate,
          isManual,
        });
      }

      const voucher = await tx.islrRetentionVoucher.create({
        data: {
          number,
          supplierId: dto.supplierId,
          serieId: dto.serieId || null,
          status: 'PENDING',
          retentionAmountUsd: round2(totalRetUsd),
          retentionAmountBs: round2(totalRetBs),
          exchangeRate: headerExchangeRate,
          unidadTributaria: valorUT,
          notes: dto.notes || null,
          createdById: userId,
          lines: { create: lineData },
        },
        include: this.includeDetail,
      });

      await tx.companyConfig.update({
        where: { id: 'singleton' },
        data: { islrRetentionNextNumber: nextSeq },
      });

      return voucher;
    });
  }

  async update(id: string, dto: UpdateIslrRetentionVoucherDto, userId: string) {
    const voucher = await this.findOne(id);
    if (voucher.status !== 'PENDING') {
      throw new BadRequestException(
        'Solo se pueden editar comprobantes en estado PENDIENTE',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.lines && dto.lines.length > 0) {
        const poIds = dto.lines.map((l) => l.purchaseOrderId);
        const orders = await tx.purchaseOrder.findMany({
          where: { id: { in: poIds } },
          select: {
            id: true,
            number: true,
            supplierId: true,
            status: true,
            subtotalUsd: true,
            subtotalBs: true,
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

        const existingLines = await tx.islrRetentionVoucherLine.findMany({
          where: {
            purchaseOrderId: { in: poIds },
            islrRetentionVoucherId: { not: id },
            islrRetentionVoucher: { status: { not: 'CANCELLED' } },
          },
          select: {
            purchaseOrderId: true,
            islrRetentionVoucher: { select: { number: true } },
          },
        });
        if (existingLines.length > 0) {
          const nums = existingLines.map((l) => l.islrRetentionVoucher.number).join(', ');
          throw new BadRequestException(
            `Algunas facturas ya tienen retención ISLR activa: ${nums}`,
          );
        }

        await tx.islrRetentionVoucherLine.deleteMany({
          where: { islrRetentionVoucherId: id },
        });

        const supplier = await tx.supplier.findUnique({
          where: { id: voucher.supplier.id },
        });
        const config = await tx.companyConfig.findUnique({
          where: { id: 'singleton' },
        });
        const valorUT = config?.unidadTributaria ?? 43;

        const typeIds = [...new Set(dto.lines.map((l) => l.islrRetentionTypeId))];
        const types = await tx.islrRetentionType.findMany({
          where: { id: { in: typeIds } },
        });
        const typesMap = new Map(types.map((t) => [t.id, t]));

        const ordersMap = new Map(orders.map((o) => [o.id, o]));
        let totalRetUsd = 0;
        let totalRetBs = 0;
        let headerExchangeRate = voucher.exchangeRate;

        for (const lineDto of dto.lines) {
          const po = ordersMap.get(lineDto.purchaseOrderId)!;
          const tipo = typesMap.get(lineDto.islrRetentionTypeId);
          if (!tipo) throw new BadRequestException('Tipo de retención ISLR no encontrado');

          const isManual = lineDto.isManual ?? false;
          const taxableBaseUsd = po.subtotalUsd;
          const taxableBaseBs = po.subtotalBs;

          let retUsd: number;
          let retBs: number;
          let sustraendoBs = 0;

          if (isManual && lineDto.retentionAmountUsd != null) {
            retUsd = round2(lineDto.retentionAmountUsd);
            retBs =
              lineDto.retentionAmountBs != null
                ? round2(lineDto.retentionAmountBs)
                : round2(retUsd * po.exchangeRate);
          } else {
            const baseAjustadaBs = taxableBaseBs * (tipo.baseImponiblePct / 100);
            const retencionBrutaBs = baseAjustadaBs * (tipo.retentionPct / 100);

            if (tipo.sustraendoUt > 0 && supplier?.supplierType === 'NATURAL_RESIDENTE') {
              sustraendoBs = round2(tipo.sustraendoUt * valorUT);
            }

            retBs = Math.max(0, round2(retencionBrutaBs - sustraendoBs));

            const baseAjustadaUsd = taxableBaseUsd * (tipo.baseImponiblePct / 100);
            const retencionBrutaUsd = baseAjustadaUsd * (tipo.retentionPct / 100);
            const sustraendoUsd = po.exchangeRate > 0 ? round2(sustraendoBs / po.exchangeRate) : 0;
            retUsd = Math.max(0, round2(retencionBrutaUsd - sustraendoUsd));
          }

          totalRetUsd += retUsd;
          totalRetBs += retBs;
          if (!headerExchangeRate) headerExchangeRate = po.exchangeRate;

          await tx.islrRetentionVoucherLine.create({
            data: {
              islrRetentionVoucherId: id,
              purchaseOrderId: po.id,
              islrRetentionTypeId: tipo.id,
              supplierInvoiceNumber: po.supplierInvoiceNumber,
              supplierControlNumber: po.supplierControlNumber,
              invoiceDate: po.invoiceDate,
              invoiceTotalUsd: po.totalUsd,
              invoiceTotalBs: po.totalBs,
              taxableBaseUsd,
              taxableBaseBs,
              baseImponiblePct: tipo.baseImponiblePct,
              retentionPct: tipo.retentionPct,
              sustraendoUt: tipo.sustraendoUt,
              sustraendoBs,
              retentionAmountUsd: retUsd,
              retentionAmountBs: retBs,
              exchangeRate: po.exchangeRate,
              isManual,
            },
          });
        }

        return tx.islrRetentionVoucher.update({
          where: { id },
          data: {
            retentionAmountUsd: round2(totalRetUsd),
            retentionAmountBs: round2(totalRetBs),
            exchangeRate: headerExchangeRate,
            serieId: dto.serieId !== undefined ? dto.serieId || null : undefined,
            notes: dto.notes !== undefined ? dto.notes || null : undefined,
          },
          include: this.includeDetail,
        });
      }

      return tx.islrRetentionVoucher.update({
        where: { id },
        data: {
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
      const updated = await tx.islrRetentionVoucher.update({
        where: { id },
        data: {
          status: 'ISSUED',
          issueDate: issueDateObj,
        },
        include: this.includeDetail,
      });

      // Create one purchase book entry per line (ISLR retention line)
      for (const line of updated.lines) {
        await tx.purchaseBookEntry.create({
          data: {
            purchaseOrderId: line.purchaseOrderId,
            entryDate: issueDateObj,
            supplierControlNumber: line.supplierControlNumber || null,
            supplierInvoiceNumber: line.supplierInvoiceNumber || null,
            supplierName: updated.supplier.name,
            supplierRif: updated.supplier.rif || 'S/R',
            islrRetentionVoucherNumber: updated.number,
            islrRetentionAmountBs: line.retentionAmountBs,
            totalBs: round2(-line.retentionAmountBs),
            isIslrRetentionLine: true,
            islrRetentionVoucherId: updated.id,
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
      if (voucher.status === 'ISSUED') {
        await tx.purchaseBookEntry.deleteMany({
          where: { islrRetentionVoucherId: id, isIslrRetentionLine: true },
        });
      }

      return tx.islrRetentionVoucher.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: this.includeDetail,
      });
    });
  }

  async getAvailablePurchaseOrders(supplierId: string) {
    const usedLines = await this.prisma.islrRetentionVoucherLine.findMany({
      where: {
        islrRetentionVoucher: {
          supplierId,
          status: { not: 'CANCELLED' },
        },
      },
      select: { purchaseOrderId: true },
    });
    const usedPoIds = usedLines.map((l) => l.purchaseOrderId).filter((id): id is string => id !== null);

    const [orders, supplier] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: {
          supplierId,
          status: 'PROCESSED',
          subtotalUsd: { gt: 0 },
          ...(usedPoIds.length > 0 ? { id: { notIn: usedPoIds } } : {}),
        },
        select: {
          id: true,
          number: true,
          purchaseNumber: true,
          invoiceDate: true,
          subtotalUsd: true,
          subtotalBs: true,
          totalUsd: true,
          totalBs: true,
          exchangeRate: true,
          supplierControlNumber: true,
          supplierInvoiceNumber: true,
        },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: { islrConceptId: true },
      }),
    ]);

    return { orders, defaultConceptId: supplier?.islrConceptId || null };
  }

  // Generate next ISLR retention number: YYYYMM + 8-digit global sequence
  async generateNumber(tx: any): Promise<{ number: string; nextSeq: number }> {
    const now = new Date();
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const config = await tx.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const seq = config?.islrRetentionNextNumber || 1;
    return {
      number: `${prefix}${String(seq).padStart(8, '0')}`,
      nextSeq: seq + 1,
    };
  }
}
