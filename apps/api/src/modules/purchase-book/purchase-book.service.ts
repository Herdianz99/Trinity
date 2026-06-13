import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseBookEntryDto } from './dto/create-purchase-book-entry.dto';
import { UpdatePurchaseBookEntryDto } from './dto/update-purchase-book-entry.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class PurchaseBookService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(from: string, to: string) {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    const entries = await this.prisma.purchaseBookEntry.findMany({
      where: {
        entryDate: { gte: fromDate, lte: toDate },
      },
      include: {
        purchaseOrder: {
          select: { id: true, number: true, purchaseNumber: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { entryDate: 'asc' },
    });

    // Reordenar al estilo SENIAT/WenSoft: cada factura seguida inmediatamente de su(s)
    // linea(s) de retencion (IVA/ISLR), emparejadas por N° de factura del proveedor + RIF.
    const retLines = entries.filter((e) => e.isRetentionLine || e.isIslrRetentionLine);
    const usedRet = new Set<string>();
    const ordered: typeof entries = [];
    for (const e of entries) {
      if (e.isRetentionLine || e.isIslrRetentionLine) continue;
      ordered.push(e);
      for (const r of retLines) {
        if (usedRet.has(r.id)) continue;
        if (
          e.supplierInvoiceNumber &&
          r.supplierInvoiceNumber === e.supplierInvoiceNumber &&
          r.supplierRif === e.supplierRif
        ) {
          ordered.push(r);
          usedRet.add(r.id);
        }
      }
    }
    // Retenciones sin factura emparejada (factura fuera del periodo) van al final
    for (const r of retLines) {
      if (!usedRet.has(r.id)) ordered.push(r);
    }

    let totalExempt = 0;
    let totalTaxableBase = 0;
    let totalIva = 0;
    let totalRetention = 0;
    let totalIslrRetention = 0;
    let totalAmount = 0;

    for (const entry of entries) {
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
      totalRetention += entry.retentionAmountBs;
      totalIslrRetention += entry.islrRetentionAmountBs;
      totalAmount += entry.totalBs;
    }

    return {
      periodo: { from: fromDate, to: toDate },
      entries: ordered,
      totales: {
        totalEntries: entries.length,
        exemptAmountBs: round2(totalExempt),
        taxableBaseBs: round2(totalTaxableBase),
        ivaAmountBs: round2(totalIva),
        retentionAmountBs: round2(totalRetention),
        islrRetentionAmountBs: round2(totalIslrRetention),
        totalBs: round2(totalAmount),
      },
    };
  }

  async create(dto: CreatePurchaseBookEntryDto, userId: string) {
    return this.prisma.purchaseBookEntry.create({
      data: {
        entryDate: new Date(dto.entryDate),
        supplierControlNumber: dto.supplierControlNumber || null,
        supplierInvoiceNumber: dto.supplierInvoiceNumber || null,
        supplierSerie: dto.supplierSerie || null,
        supplierName: dto.supplierName,
        supplierRif: dto.supplierRif,
        exemptAmountBs: dto.exemptAmountBs || 0,
        taxableBaseBs: dto.taxableBaseBs || 0,
        ivaAmountBs: dto.ivaAmountBs || 0,
        retentionVoucherNumber: dto.retentionVoucherNumber || null,
        retentionAmountBs: dto.retentionAmountBs || 0,
        totalBs: dto.totalBs || 0,
        isManual: true,
        notes: dto.notes || null,
        createdById: userId,
      },
      include: {
        purchaseOrder: {
          select: { id: true, number: true, purchaseNumber: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdatePurchaseBookEntryDto) {
    const entry = await this.prisma.purchaseBookEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada del libro de compras no encontrada');
    }

    const data: any = {};
    if (dto.entryDate !== undefined) data.entryDate = new Date(dto.entryDate);
    if (dto.supplierControlNumber !== undefined) data.supplierControlNumber = dto.supplierControlNumber;
    if (dto.supplierInvoiceNumber !== undefined) data.supplierInvoiceNumber = dto.supplierInvoiceNumber;
    if (dto.supplierSerie !== undefined) data.supplierSerie = dto.supplierSerie;
    if (dto.supplierName !== undefined) data.supplierName = dto.supplierName;
    if (dto.supplierRif !== undefined) data.supplierRif = dto.supplierRif;
    if (dto.exemptAmountBs !== undefined) data.exemptAmountBs = dto.exemptAmountBs;
    if (dto.taxableBaseBs !== undefined) data.taxableBaseBs = dto.taxableBaseBs;
    if (dto.ivaAmountBs !== undefined) data.ivaAmountBs = dto.ivaAmountBs;
    if (dto.retentionVoucherNumber !== undefined) data.retentionVoucherNumber = dto.retentionVoucherNumber;
    if (dto.retentionAmountBs !== undefined) data.retentionAmountBs = dto.retentionAmountBs;
    if (dto.totalBs !== undefined) data.totalBs = dto.totalBs;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.purchaseBookEntry.update({
      where: { id },
      data,
      include: {
        purchaseOrder: {
          select: { id: true, number: true, purchaseNumber: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede eliminar entradas del libro de compras');
    }

    const entry = await this.prisma.purchaseBookEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada del libro de compras no encontrada');
    }

    await this.prisma.purchaseBookEntry.delete({ where: { id } });
    return { deleted: true };
  }

  async generatePdfData(from: string, to: string) {
    const data = await this.findAll(from, to);

    // Build fiscal summary by IVA rate
    // Since entries store aggregated amounts, we return the totals for the summary page
    const summary = {
      periodo: { from, to },
      comprasExentas: data.totales.exemptAmountBs,
      baseImponibleGeneral: data.totales.taxableBaseBs,
      creditoFiscalGeneral: data.totales.ivaAmountBs,
      totalBaseImponible: data.totales.taxableBaseBs,
      totalCreditoFiscal: data.totales.ivaAmountBs,
      totalRetencionesIva: data.totales.retentionAmountBs,
      creditoFiscalNeto: round2(data.totales.ivaAmountBs - data.totales.retentionAmountBs),
      totalCompras: data.totales.totalBs,
    };

    return {
      ...data,
      summary,
    };
  }
}
