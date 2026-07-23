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

    // Orden cronologico por la fecha que se MUESTRA en el libro (documentDate ?? entryDate), con
    // createdAt como desempate estable. El filtro/periodo sigue siendo entryDate, pero la columna
    // "Fecha" del reporte debe salir ascendente (si no, con documentDate != entryDate se ve saltada).
    entries.sort((a, b) => {
      const da = (a.documentDate ?? a.entryDate).getTime();
      const db = (b.documentDate ?? b.entryDate).getTime();
      if (da !== db) return da - db;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Orden ESTRICTO cronologico por la fecha mostrada (documentDate ?? entryDate), ya aplicado en
    // el sort de arriba. Antes se reordenaba al estilo SENIAT/WenSoft (cada retencion pegada debajo
    // de su factura); pero como la linea de retencion muestra su fecha de EMISION —posterior a la de
    // la factura— la columna "Fecha" saltaba. Ahora cada retencion aparece en su propia fecha, en
    // orden ascendente junto al resto de los movimientos.
    const ordered = entries;

    let totalExempt = 0;
    let totalTaxableBase = 0;
    let totalIva = 0;
    let totalRetention = 0;
    let totalIslrRetention = 0;
    let totalAmount = 0;

    for (const entry of entries) {
      // Las lineas de retencion NO suman a exento/base/credito-fiscal/total (esos van en BRUTO,
      // solo de las facturas). La retencion se acumula aparte: se guarda como ivaAmountBs negativo
      // en su linea (retentionAmountBs suele quedar en 0), asi que se toma retentionAmountBs si viene
      // o, si no, el negativo del IVA de la linea.
      if (entry.isRetentionLine) {
        totalRetention += entry.retentionAmountBs || -entry.ivaAmountBs;
        continue;
      }
      if (entry.isIslrRetentionLine) {
        totalIslrRetention += entry.islrRetentionAmountBs || -entry.ivaAmountBs;
        continue;
      }
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
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
        documentDate: dto.documentDate ? new Date(dto.documentDate) : new Date(dto.entryDate),
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
    if (dto.documentDate !== undefined) data.documentDate = dto.documentDate ? new Date(dto.documentDate) : null;
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseBookEntry.update({
        where: { id },
        data,
        include: {
          purchaseOrder: {
            select: { id: true, number: true, purchaseNumber: true },
          },
          createdBy: { select: { id: true, name: true } },
        },
      });

      // Si se cambio la fecha de DECLARACION (entryDate) de una FACTURA (no una linea de
      // retencion), arrastrar esa fecha a su(s) linea(s) de retencion del libro (entryDate Y
      // documentDate, porque la retencion se MUESTRA con su fecha de declaracion/recepcion, no con
      // la de la factura) y al issueDate del/los comprobante(s), para que factura y retencion
      // queden en el MISMO periodo. Un cambio de solo la fecha de documento de la factura
      // (documentDate = display de la factura) NO mueve la retencion. El numero del comprobante
      // (prefijo YYYYMM) se mantiene. Se emparejan por payableId o purchaseOrderId.
      const movedDate = dto.entryDate !== undefined || dto.documentDate !== undefined;
      const isFactura = !entry.isRetentionLine && !entry.isIslrRetentionLine;
      const link = entry.payableId
        ? { payableId: entry.payableId }
        : entry.purchaseOrderId
          ? { purchaseOrderId: entry.purchaseOrderId }
          : null;

      if (movedDate && isFactura && link) {
        const retWhere = {
          ...link,
          OR: [{ isRetentionLine: true }, { isIslrRetentionLine: true }],
        };
        const retLines = await tx.purchaseBookEntry.findMany({
          where: retWhere,
          select: { id: true, retentionVoucherId: true, islrRetentionVoucherId: true },
        });
        if (retLines.length > 0) {
          const retData: any = {};
          if (dto.entryDate !== undefined) {
            retData.entryDate = data.entryDate;
            // La retencion se muestra con su fecha de declaracion/recepcion (= issueDate), no con
            // la fecha de la factura; al mover la declaracion de la factura, la retencion la sigue.
            retData.documentDate = data.entryDate;
          }
          // NO copiar dto.documentDate (fecha de la factura) a la retencion.
          if (Object.keys(retData).length > 0) {
            await tx.purchaseBookEntry.updateMany({ where: retWhere, data: retData });
          }

          // El issueDate del comprobante = fecha de declaracion de la retencion → mover con entryDate
          if (dto.entryDate !== undefined) {
            const ivaIds = retLines
              .map((r) => r.retentionVoucherId)
              .filter((x): x is string => !!x);
            const islrIds = retLines
              .map((r) => r.islrRetentionVoucherId)
              .filter((x): x is string => !!x);
            if (ivaIds.length > 0) {
              await tx.retentionVoucher.updateMany({
                where: { id: { in: ivaIds } },
                data: { issueDate: data.entryDate },
              });
            }
            if (islrIds.length > 0) {
              await tx.islrRetentionVoucher.updateMany({
                where: { id: { in: islrIds } },
                data: { issueDate: data.entryDate },
              });
            }
          }
        }
      }

      return updated;
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
