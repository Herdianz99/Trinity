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

// Base imponible ISLR de una CxP = solo bases gravables (sin exento ni IVA): el exento no es
// ingreso del proveedor por el concepto (ej. valor nominal de tickets de alimentacion).
// Si no hay base gravable (factura 100% exenta, ej. honorarios/alquiler de un no contribuyente
// de IVA), la base es el exento.
function payableIslrBase(p: {
  exemptBaseUsd: number; exemptBaseBs: number;
  taxableBase8Usd: number; taxableBase8Bs: number;
  taxableBase16Usd: number; taxableBase16Bs: number;
  taxableBase31Usd: number; taxableBase31Bs: number;
}): { baseUsd: number; baseBs: number } {
  const taxUsd = round2(p.taxableBase8Usd + p.taxableBase16Usd + p.taxableBase31Usd);
  const taxBs = round2(p.taxableBase8Bs + p.taxableBase16Bs + p.taxableBase31Bs);
  if (taxUsd > 0) return { baseUsd: taxUsd, baseBs: taxBs };
  return { baseUsd: round2(p.exemptBaseUsd), baseBs: round2(p.exemptBaseBs) };
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
        payable: {
          select: {
            id: true, number: true, documentNumber: true, originalDate: true,
            amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true,
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

    // Resolver cada linea a un documento: FC (base = subtotal sin IVA) o CxP (base = solo gravables, sin exento ni IVA)
    const resolved = await Promise.all(dto.lines.map(async (l) => {
      if (l.purchaseOrderId) {
        const po = await this.prisma.purchaseOrder.findUnique({ where: { id: l.purchaseOrderId } });
        if (!po) throw new BadRequestException('Factura de compra no encontrada');
        if (po.supplierId !== dto.supplierId) throw new BadRequestException(`La factura ${po.number} no pertenece al proveedor seleccionado`);
        if (po.status !== 'PROCESSED') throw new BadRequestException(`La factura ${po.number} no está procesada`);
        return { line: l, kind: 'PO' as const, id: po.id, baseUsd: po.subtotalUsd, baseBs: po.subtotalBs, totalUsd: po.totalUsd, totalBs: po.totalBs, exchangeRate: po.exchangeRate, invoiceDate: po.invoiceDate, controlNumber: po.supplierControlNumber, invoiceNumber: po.supplierInvoiceNumber };
      }
      if (l.payableId) {
        const p = await this.prisma.payable.findUnique({ where: { id: l.payableId } });
        if (!p) throw new BadRequestException('Cuenta por pagar no encontrada');
        if (p.supplierId !== dto.supplierId) throw new BadRequestException(`La CxP ${p.number} no pertenece al proveedor seleccionado`);
        const { baseUsd, baseBs } = payableIslrBase(p);
        return { line: l, kind: 'PAY' as const, id: p.id, baseUsd, baseBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, invoiceDate: p.originalDate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }
      throw new BadRequestException('Cada linea debe referir una factura de compra o una CxP');
    }));

    // No duplicar en un comprobante ISLR activo (FC o CxP)
    const poIds = resolved.filter((rr) => rr.kind === 'PO').map((rr) => rr.id);
    const payIds = resolved.filter((rr) => rr.kind === 'PAY').map((rr) => rr.id);
    const existingLines = await this.prisma.islrRetentionVoucherLine.findMany({
      where: {
        islrRetentionVoucher: { status: { not: 'CANCELLED' } },
        OR: [{ purchaseOrderId: { in: poIds } }, { payableId: { in: payIds } }],
      },
      select: { islrRetentionVoucher: { select: { number: true } } },
    });
    if (existingLines.length > 0) {
      const nums = existingLines.map((l) => l.islrRetentionVoucher.number).join(', ');
      throw new BadRequestException(
        `Algunos documentos ya tienen retención ISLR activa: ${nums}`,
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

      const lineData: any[] = [];

      for (const rdoc of resolved) {
        const tipo = typesMap.get(rdoc.line.islrRetentionTypeId)!;
        const isManual = rdoc.line.isManual ?? false;

        // Base imponible = subtotal sin IVA (FC: subtotal; CxP: solo bases gravables, sin exento)
        const taxableBaseUsd = rdoc.baseUsd;
        const taxableBaseBs = rdoc.baseBs;

        let retUsd: number;
        let retBs: number;
        let sustraendoBs = 0;

        if (isManual && rdoc.line.retentionAmountUsd != null) {
          retUsd = round2(rdoc.line.retentionAmountUsd);
          retBs =
            rdoc.line.retentionAmountBs != null
              ? round2(rdoc.line.retentionAmountBs)
              : round2(retUsd * rdoc.exchangeRate);
        } else {
          // Formula: ret = (base * baseImponiblePct/100 * retentionPct/100) - sustraendo
          const baseAjustadaBs = taxableBaseBs * (tipo.baseImponiblePct / 100);
          const retencionBrutaBs = baseAjustadaBs * (tipo.retentionPct / 100);

          if (tipo.sustraendoUt > 0 && supplier.supplierType === 'NATURAL_RESIDENTE') {
            sustraendoBs = round2(tipo.sustraendoUt * valorUT);
          }

          retBs = Math.max(0, round2(retencionBrutaBs - sustraendoBs));

          const baseAjustadaUsd = taxableBaseUsd * (tipo.baseImponiblePct / 100);
          const retencionBrutaUsd = baseAjustadaUsd * (tipo.retentionPct / 100);
          const sustraendoUsd = rdoc.exchangeRate > 0 ? round2(sustraendoBs / rdoc.exchangeRate) : 0;
          retUsd = Math.max(0, round2(retencionBrutaUsd - sustraendoUsd));
        }

        totalRetUsd += retUsd;
        totalRetBs += retBs;
        if (!headerExchangeRate) headerExchangeRate = rdoc.exchangeRate;

        lineData.push({
          purchaseOrderId: rdoc.kind === 'PO' ? rdoc.id : null,
          payableId: rdoc.kind === 'PAY' ? rdoc.id : null,
          islrRetentionTypeId: tipo.id,
          supplierInvoiceNumber: rdoc.invoiceNumber,
          supplierControlNumber: rdoc.controlNumber,
          invoiceDate: rdoc.invoiceDate,
          invoiceTotalUsd: rdoc.totalUsd,
          invoiceTotalBs: rdoc.totalBs,
          taxableBaseUsd,
          taxableBaseBs,
          baseImponiblePct: tipo.baseImponiblePct,
          retentionPct: tipo.retentionPct,
          sustraendoUt: tipo.sustraendoUt,
          sustraendoBs,
          retentionAmountUsd: retUsd,
          retentionAmountBs: retBs,
          exchangeRate: rdoc.exchangeRate,
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

  // ── Conceptos adicionales ────────────────────────────────────────────────
  // Una misma factura puede llevar varios conceptos ISLR (ej. servicio 2% + fletes 3%).
  // La primera linea sale de la factura; las adicionales cuelgan del MISMO documento
  // (FC o CxP) pero con base imponible en Bs escrita a mano. Todas suman al total del
  // comprobante, que es lo que se descuenta al proveedor en el recibo de pago.

  /** Se puede modificar si esta PENDIENTE, o EMITIDO pero aun no aplicado en un recibo. */
  private async assertConceptsEditable(voucher: { id: string; status: string; appliedAt: Date | null; number: string }) {
    if (voucher.status === 'CANCELLED') throw new BadRequestException('El comprobante está anulado');
    // Un recibo (aun en borrador) guarda una copia del monto: cambiarlo lo descuadraria.
    const inReceipt = await this.prisma.receiptItem.count({ where: { islrRetentionVoucherId: voucher.id } });
    if (voucher.appliedAt || inReceipt > 0) {
      throw new BadRequestException(
        `La retención ISLR ${voucher.number} ya está en un recibo de pago; no se pueden cambiar sus conceptos`,
      );
    }
  }

  /** Recalcula los totales del comprobante a partir de sus lineas. */
  private async recalcTotals(tx: any, voucherId: string) {
    const agg = await tx.islrRetentionVoucherLine.aggregate({
      where: { islrRetentionVoucherId: voucherId },
      _sum: { retentionAmountUsd: true, retentionAmountBs: true },
    });
    await tx.islrRetentionVoucher.update({
      where: { id: voucherId },
      data: {
        retentionAmountUsd: round2(agg._sum.retentionAmountUsd ?? 0),
        retentionAmountBs: round2(agg._sum.retentionAmountBs ?? 0),
      },
    });
  }

  /**
   * Comprobante ya emitido: el libro de compras lleva una fila ISLR por factura con el
   * total retenido de esa factura (suma de todos sus conceptos). Se ajusta esa fila.
   */
  private async syncIssuedBookForDoc(
    tx: any,
    voucherId: string,
    doc: { purchaseOrderId: string | null; payableId: string | null },
    userId: string,
  ) {
    const voucher = await tx.islrRetentionVoucher.findUnique({
      where: { id: voucherId },
      include: { supplier: { select: { name: true, rif: true } } },
    });
    if (!voucher || voucher.status !== 'ISSUED') return;

    const docWhere = doc.payableId ? { payableId: doc.payableId } : { purchaseOrderId: doc.purchaseOrderId };
    const lines = await tx.islrRetentionVoucherLine.findMany({
      where: { islrRetentionVoucherId: voucherId, ...docWhere },
      orderBy: { createdAt: 'asc' },
    });
    const totalBs = round2(lines.reduce((s: number, l: any) => s + l.retentionAmountBs, 0));

    const entries = await tx.purchaseBookEntry.findMany({
      where: { islrRetentionVoucherId: voucherId, isIslrRetentionLine: true, ...docWhere },
      orderBy: { createdAt: 'asc' },
    });
    if (entries.length > 0) {
      await tx.purchaseBookEntry.update({
        where: { id: entries[0].id },
        data: { islrRetentionAmountBs: totalBs, totalBs: -totalBs },
      });
      // Si habia una fila por linea (emisiones viejas), se dejan en una sola por factura.
      if (entries.length > 1) {
        await tx.purchaseBookEntry.deleteMany({ where: { id: { in: entries.slice(1).map((e: any) => e.id) } } });
      }
      return;
    }
    const first = lines[0];
    if (!first) return;
    await tx.purchaseBookEntry.create({
      data: {
        purchaseOrderId: doc.purchaseOrderId,
        payableId: doc.payableId,
        entryDate: voucher.issueDate ?? new Date(),
        documentDate: voucher.issueDate ?? null,
        supplierControlNumber: first.supplierControlNumber || null,
        supplierInvoiceNumber: first.supplierInvoiceNumber || null,
        supplierName: voucher.supplier.name,
        supplierRif: voucher.supplier.rif || 'S/R',
        islrRetentionVoucherNumber: voucher.number,
        islrRetentionAmountBs: totalBs,
        totalBs: -totalBs,
        isIslrRetentionLine: true,
        islrRetentionVoucherId: voucherId,
        isManual: false,
        createdById: userId,
      },
    });
  }

  async addExtraConcept(
    id: string,
    dto: { baseLineId: string; islrRetentionTypeId: string; taxableBaseBs: number },
    userId: string,
  ) {
    const baseBs = round2(Number(dto.taxableBaseBs));
    if (!(baseBs > 0)) throw new BadRequestException('La base imponible debe ser mayor a 0');

    const voucher = await this.prisma.islrRetentionVoucher.findUnique({
      where: { id },
      include: { supplier: true, lines: true },
    });
    if (!voucher) throw new NotFoundException('Comprobante de retención ISLR no encontrado');
    await this.assertConceptsEditable(voucher);

    const baseLine = voucher.lines.find((l) => l.id === dto.baseLineId && !l.isExtraConcept);
    if (!baseLine) throw new BadRequestException('Factura del comprobante no encontrada');

    const tipo = await this.prisma.islrRetentionType.findUnique({ where: { id: dto.islrRetentionTypeId } });
    if (!tipo) throw new BadRequestException('Tipo de retención ISLR no encontrado');

    // Tasa de la factura a la que pertenece el concepto (la misma de su primera linea).
    const rate = baseLine.exchangeRate || voucher.exchangeRate;
    if (!(rate > 0)) throw new BadRequestException('La factura no tiene tasa de cambio');

    let sustraendoBs = 0;
    if (tipo.sustraendoUt > 0 && voucher.supplier.supplierType === 'NATURAL_RESIDENTE') {
      sustraendoBs = round2(tipo.sustraendoUt * voucher.unidadTributaria);
    }
    const retBs = Math.max(0, round2(baseBs * (tipo.baseImponiblePct / 100) * (tipo.retentionPct / 100) - sustraendoBs));
    const baseUsd = round2(baseBs / rate);
    const retUsd = round2(retBs / rate);

    return this.prisma.$transaction(async (tx) => {
      await tx.islrRetentionVoucherLine.create({
        data: {
          islrRetentionVoucherId: id,
          purchaseOrderId: baseLine.purchaseOrderId,
          payableId: baseLine.payableId,
          islrRetentionTypeId: tipo.id,
          // Se copian los datos de la factura: el XML del SENIAT exige el Nº de factura por concepto.
          supplierInvoiceNumber: baseLine.supplierInvoiceNumber,
          supplierControlNumber: baseLine.supplierControlNumber,
          invoiceDate: baseLine.invoiceDate,
          invoiceTotalUsd: 0,
          invoiceTotalBs: 0,
          taxableBaseUsd: baseUsd,
          taxableBaseBs: baseBs,
          baseImponiblePct: tipo.baseImponiblePct,
          retentionPct: tipo.retentionPct,
          sustraendoUt: tipo.sustraendoUt,
          sustraendoBs,
          retentionAmountUsd: retUsd,
          retentionAmountBs: retBs,
          exchangeRate: rate,
          isManual: false,
          isExtraConcept: true,
        },
      });
      await this.recalcTotals(tx, id);
      await this.syncIssuedBookForDoc(tx, id, baseLine, userId);
      return tx.islrRetentionVoucher.findUnique({ where: { id }, include: this.includeDetail });
    });
  }

  async removeExtraConcept(id: string, lineId: string, userId: string) {
    const voucher = await this.prisma.islrRetentionVoucher.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!voucher) throw new NotFoundException('Comprobante de retención ISLR no encontrado');
    await this.assertConceptsEditable(voucher);

    const line = voucher.lines.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('Concepto no encontrado');
    if (!line.isExtraConcept) {
      throw new BadRequestException('Solo se pueden quitar conceptos adicionales; el concepto de la factura no se quita');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.islrRetentionVoucherLine.delete({ where: { id: lineId } });
      await this.recalcTotals(tx, id);
      await this.syncIssuedBookForDoc(tx, id, line, userId);
      return tx.islrRetentionVoucher.findUnique({ where: { id }, include: this.includeDetail });
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

      // Una fila del libro de compras por FACTURA con el total retenido de todos sus
      // conceptos (la factura puede tener conceptos adicionales con base manual).
      const byDoc = new Map<string, { line: (typeof updated.lines)[number]; retentionAmountBs: number }>();
      for (const l of updated.lines) {
        const key = l.payableId ? `P:${l.payableId}` : l.purchaseOrderId ? `O:${l.purchaseOrderId}` : `L:${l.id}`;
        const g = byDoc.get(key);
        if (g) g.retentionAmountBs = round2(g.retentionAmountBs + l.retentionAmountBs);
        else byDoc.set(key, { line: l, retentionAmountBs: l.retentionAmountBs });
      }
      for (const { line: docLine, retentionAmountBs } of byDoc.values()) {
        const line = { ...docLine, retentionAmountBs };
        await tx.purchaseBookEntry.create({
          data: {
            purchaseOrderId: line.purchaseOrderId || null,
            payableId: line.payableId || null,
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

  /** FCs procesadas + CxP fiscales con base sin IVA, sin retencion ISLR activa. */
  async getAvailableDocuments(supplierId: string) {
    const usedLines = await this.prisma.islrRetentionVoucherLine.findMany({
      where: { islrRetentionVoucher: { supplierId, status: { not: 'CANCELLED' } } },
      select: { purchaseOrderId: true, payableId: true },
    });
    const usedPo = usedLines.map((l) => l.purchaseOrderId).filter((x): x is string => !!x);
    const usedPay = usedLines.map((l) => l.payableId).filter((x): x is string => !!x);

    const [orders, payables, supplier] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { supplierId, status: 'PROCESSED', subtotalUsd: { gt: 0 }, ...(usedPo.length ? { id: { notIn: usedPo } } : {}) },
        select: { id: true, number: true, invoiceDate: true, subtotalUsd: true, subtotalBs: true, totalUsd: true, totalBs: true, exchangeRate: true, supplierControlNumber: true, supplierInvoiceNumber: true },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.payable.findMany({
        where: { supplierId, serie: { isFiscal: true }, ...(usedPay.length ? { id: { notIn: usedPay } } : {}) },
        select: { id: true, number: true, documentNumber: true, originalDate: true, exemptBaseUsd: true, exemptBaseBs: true, taxableBase8Usd: true, taxableBase8Bs: true, taxableBase16Usd: true, taxableBase16Bs: true, taxableBase31Usd: true, taxableBase31Bs: true, amountUsd: true, amountBs: true, exchangeRate: true, controlFiscal: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { islrConceptId: true } }),
    ]);

    const docs = [
      ...orders.map((o) => ({ docType: 'PURCHASE_ORDER' as const, id: o.id, number: o.number, invoiceDate: o.invoiceDate, baseUsd: o.subtotalUsd, baseBs: o.subtotalBs, totalUsd: o.totalUsd, totalBs: o.totalBs, exchangeRate: o.exchangeRate, controlNumber: o.supplierControlNumber, invoiceNumber: o.supplierInvoiceNumber })),
      ...payables.map((p) => {
        const { baseUsd, baseBs } = payableIslrBase(p);
        return { docType: 'PAYABLE' as const, id: p.id, number: p.documentNumber || p.number, invoiceDate: p.originalDate, baseUsd, baseBs, totalUsd: p.amountUsd, totalBs: p.amountBs, exchangeRate: p.exchangeRate, controlNumber: p.controlFiscal, invoiceNumber: p.documentNumber };
      }).filter((p) => p.baseUsd > 0),
    ];
    return { documents: docs, defaultConceptId: supplier?.islrConceptId || null };
  }

  // Normaliza un RIF al formato del SENIAT: letra + 9 digitos, sin guiones. Ej. "J-00327444-5" -> "J003274445".
  private normalizeRif(rif?: string | null): string {
    if (!rif) return '';
    const clean = rif.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const m = clean.match(/^([A-Z]?)(\d+)$/);
    if (!m) return clean;
    const letter = m[1] || 'J';
    return `${letter}${m[2].padStart(9, '0')}`;
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Formatea un numero sin ceros decimales sobrantes (ej. 232.859000 -> "232.859", 5 -> "5").
  private trimNum(n: number): string {
    return n.toFixed(6).replace(/\.?0+$/, '');
  }

  // XML de retenciones de ISLR para el portal SENIAT (RelacionRetencionesISLR), declaracion mensual.
  // Una fila (DetalleRetencion) por cada factura del comprobante emitido en el rango.
  // Reproduce el formato de Wensoft: sin declaracion <?xml?>, saltos CRLF, indentado con tabs.
  // OJO: <MontoOperacion> = monto retenido BRUTO (base x baseImpPct% x retPct%), no la base
  // imponible. Asi lo emite Wensoft (verificado contra comprobantes 24/25/26). El portal
  // SENIAT exige exactamente 2 decimales, asi que se formatea con toFixed(2).
  async generateIslrXml(
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
    const period = `${fromDate.getUTCFullYear()}${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}`;

    // Comprobantes emitidos cuya fecha de emision (fecha de operacion) cae en el rango.
    const vouchers = await this.prisma.islrRetentionVoucher.findMany({
      where: {
        status: 'ISSUED',
        issueDate: { gte: fromDate, lte: toDate },
      },
      include: {
        supplier: { select: { rif: true } },
        lines: {
          include: { islrRetentionType: { select: { codigo: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { issueDate: 'asc' },
    });

    const detalles: string[] = [];
    for (const v of vouchers) {
      const supplierRif = this.normalizeRif(v.supplier?.rif);
      // SENIAT valida dd/mm/yyyy con dia y mes de 2 digitos (ceros delante): 04/08/2026.
      const fecha = v.issueDate
        ? `${String(v.issueDate.getUTCDate()).padStart(2, '0')}/${String(v.issueDate.getUTCMonth() + 1).padStart(2, '0')}/${v.issueDate.getUTCFullYear()}`
        : '';
      for (const line of v.lines) {
        // Monto retenido bruto (sin sustraendo, sin redondeo) = base x baseImpPct% x retPct%.
        const montoOperacion =
          (line.taxableBaseBs * line.baseImponiblePct * line.retentionPct) / 10000;
        const codigo = String(line.islrRetentionType?.codigo ?? '').padStart(3, '0');
        detalles.push(
          [
            '\t<DetalleRetencion>',
            `\t\t<RifRetenido>${this.escapeXml(supplierRif)}</RifRetenido>`,
            `\t\t<NumeroFactura>${this.escapeXml(line.supplierInvoiceNumber || '')}</NumeroFactura>`,
            `\t\t<NumeroControl>${this.escapeXml(v.number)}</NumeroControl>`,
            `\t\t<FechaOperacion>${fecha}</FechaOperacion>`,
            `\t\t<CodigoConcepto>${this.escapeXml(codigo)}</CodigoConcepto>`,
            `\t\t<MontoOperacion>${montoOperacion.toFixed(2)}</MontoOperacion>`,
            `\t\t<PorcentajeRetencion>${this.trimNum(line.retentionPct)}</PorcentajeRetencion>`,
            '\t</DetalleRetencion>',
          ].join('\r\n'),
        );
      }
    }

    const content =
      `<RelacionRetencionesISLR RifAgente="${this.escapeXml(agentRif)}" Periodo="${period}">\r\n` +
      (detalles.length ? detalles.join('\r\n') + '\r\n' : '') +
      `</RelacionRetencionesISLR>\r\n`;

    const filename = `retenciones_islr_${period}.xml`;
    return { content, filename };
  }

  // Numero de retencion ISLR: secuencia "pelada" (ej. 24, 25, 26...). A diferencia del
  // comprobante de IVA, el de ISLR no exige el formato AAAAMM+consecutivo del SENIAT.
  async generateNumber(tx: any): Promise<{ number: string; nextSeq: number }> {
    const config = await tx.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    const seq = config?.islrRetentionNextNumber || 1;
    return {
      number: `${seq}`,
      nextSeq: seq + 1,
    };
  }
}
