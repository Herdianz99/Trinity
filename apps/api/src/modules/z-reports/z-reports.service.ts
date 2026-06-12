import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateZReportDto } from './dto/create-z-report.dto';
import { UpdateZReportDto } from './dto/update-z-report.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class ZReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(from: string, to: string) {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    // 1. Buscar ZReports en rango
    const zReports = await this.prisma.zReport.findMany({
      where: {
        reportDate: { gte: fromDate, lte: toDate },
      },
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { reportDate: 'asc' },
    });

    // 2. Buscar retenciones del SalesBookEntry en mismo rango
    const retentions = await this.prisma.salesBookEntry.findMany({
      where: {
        entryDate: { gte: fromDate, lte: toDate },
        isRetentionLine: true,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { entryDate: 'asc' },
    });

    // 3. Transformar ZReports a display rows
    const displayRows: any[] = [];

    for (const z of zReports) {
      const salesTotalBase = z.salesTaxBase1Bs + z.salesTaxBase2Bs + z.salesTaxBase3Bs;
      const salesTotalTax = z.salesTax1Bs + z.salesTax2Bs + z.salesTax3Bs;
      const salesTotalIgtf = z.igtfSalesTaxBs;
      const salesTotal = z.salesExemptBs + salesTotalBase + salesTotalTax + salesTotalIgtf;

      // Row de ventas (siempre)
      displayRows.push({
        id: z.id,
        type: 'ventas',
        reportDate: z.reportDate,
        zNumber: z.zNumber,
        machineSerial: z.machineSerial,
        cashRegister: z.cashRegister,
        fromDoc: z.firstInvoiceNumber || '',
        toDoc: z.lastInvoiceNumber || '',
        docCount: z.invoiceCount,
        exemptBs: round2(z.salesExemptBs),
        taxBaseBs: round2(salesTotalBase),
        taxBs: round2(salesTotalTax),
        igtfBs: round2(salesTotalIgtf),
        totalBs: round2(salesTotal),
        isManual: z.isManual,
        createdBy: z.createdBy,
        zReportId: z.id,
      });

      // Row de devoluciones (solo si hay montos NC != 0)
      const ncTotalBase = z.ncTaxBase1Bs + z.ncTaxBase2Bs + z.ncTaxBase3Bs;
      const ncTotalTax = z.ncTax1Bs + z.ncTax2Bs + z.ncTax3Bs;
      const ncTotalIgtf = z.igtfNcTaxBs;
      const ncTotal = z.ncExemptBs + ncTotalBase + ncTotalTax + ncTotalIgtf;

      if (Math.abs(ncTotal) > 0) {
        // NC siempre se muestra negativo (resta), sin importar si el usuario guardó positivo o negativo
        displayRows.push({
          id: `${z.id}-nc`,
          type: 'devoluciones',
          reportDate: z.reportDate,
          zNumber: z.zNumber,
          machineSerial: z.machineSerial,
          cashRegister: z.cashRegister,
          fromDoc: z.firstCreditNoteNumber || '',
          toDoc: z.lastCreditNoteNumber || '',
          docCount: z.creditNoteCount,
          exemptBs: round2(-Math.abs(z.ncExemptBs)),
          taxBaseBs: round2(-Math.abs(ncTotalBase)),
          taxBs: round2(-Math.abs(ncTotalTax)),
          igtfBs: round2(-Math.abs(ncTotalIgtf)),
          totalBs: round2(-Math.abs(ncTotal)),
          isManual: z.isManual,
          createdBy: z.createdBy,
          zReportId: z.id,
        });
      }

      // Row de ND (solo si hay montos ND != 0)
      const ndTotalBase = z.ndTaxBase1Bs + z.ndTaxBase2Bs + z.ndTaxBase3Bs;
      const ndTotalTax = z.ndTax1Bs + z.ndTax2Bs + z.ndTax3Bs;
      const ndTotalIgtf = z.igtfNdTaxBs;
      const ndTotal = z.ndExemptBs + ndTotalBase + ndTotalTax + ndTotalIgtf;

      if (Math.abs(ndTotal) > 0) {
        displayRows.push({
          id: `${z.id}-nd`,
          type: 'debitos',
          reportDate: z.reportDate,
          zNumber: z.zNumber,
          machineSerial: z.machineSerial,
          cashRegister: z.cashRegister,
          fromDoc: z.firstDebitNoteNumber || '',
          toDoc: z.lastDebitNoteNumber || '',
          docCount: z.debitNoteCount,
          exemptBs: round2(Math.abs(z.ndExemptBs)),
          taxBaseBs: round2(Math.abs(ndTotalBase)),
          taxBs: round2(Math.abs(ndTotalTax)),
          igtfBs: round2(Math.abs(ndTotalIgtf)),
          totalBs: round2(Math.abs(ndTotal)),
          isManual: z.isManual,
          createdBy: z.createdBy,
          zReportId: z.id,
        });
      }
    }

    // 4. Agregar retenciones como rows
    for (const ret of retentions) {
      displayRows.push({
        id: ret.id,
        type: 'retencion',
        reportDate: ret.entryDate,
        zNumber: null,
        machineSerial: '',
        cashRegister: null,
        fromDoc: ret.notes || '',
        toDoc: '',
        docCount: 0,
        exemptBs: round2(ret.exemptAmountBs),
        taxBaseBs: round2(ret.taxableBaseBs),
        taxBs: round2(ret.ivaAmountBs),
        igtfBs: round2(ret.igtfAmountBs),
        totalBs: round2(ret.totalBs),
        isManual: ret.isManual,
        createdBy: ret.createdBy,
        customerName: ret.customerName,
        customerRif: ret.customerRif,
        zReportId: null,
      });
    }

    // 5. Ordenar por fecha
    displayRows.sort((a, b) => new Date(a.reportDate).getTime() - new Date(b.reportDate).getTime());

    // 6. Calcular totales
    let totalExempt = 0;
    let totalTaxBase = 0;
    let totalTax = 0;
    let totalIgtf = 0;
    let totalAmount = 0;

    for (const row of displayRows) {
      totalExempt += row.exemptBs;
      totalTaxBase += row.taxBaseBs;
      totalTax += row.taxBs;
      totalIgtf += row.igtfBs;
      totalAmount += row.totalBs;
    }

    return {
      periodo: { from: fromDate, to: toDate },
      rows: displayRows,
      zReports,
      totales: {
        totalRows: displayRows.length,
        exemptBs: round2(totalExempt),
        taxBaseBs: round2(totalTaxBase),
        taxBs: round2(totalTax),
        igtfBs: round2(totalIgtf),
        totalBs: round2(totalAmount),
      },
    };
  }

  async create(dto: CreateZReportDto, userId: string) {
    // Check if a Z report with same zNumber+machineSerial already exists
    // If so, merge the new data into the existing record (e.g. adding NC data to existing sales)
    const existing = await this.prisma.zReport.findFirst({
      where: {
        zNumber: dto.zNumber,
        machineSerial: dto.machineSerial,
      },
    });

    if (existing) {
      const mergeData: any = {};
      // Merge sales fields if they have values and existing ones are zero
      if (dto.salesExemptBs && !existing.salesExemptBs) mergeData.salesExemptBs = dto.salesExemptBs;
      if (dto.salesTaxBase1Bs && !existing.salesTaxBase1Bs) mergeData.salesTaxBase1Bs = dto.salesTaxBase1Bs;
      if (dto.salesTax1Bs && !existing.salesTax1Bs) mergeData.salesTax1Bs = dto.salesTax1Bs;
      if (dto.igtfSalesTaxBs && !existing.igtfSalesTaxBs) mergeData.igtfSalesTaxBs = dto.igtfSalesTaxBs;
      if (dto.lastInvoiceNumber && !existing.lastInvoiceNumber) mergeData.lastInvoiceNumber = dto.lastInvoiceNumber;
      if (dto.firstInvoiceNumber && !existing.firstInvoiceNumber) mergeData.firstInvoiceNumber = dto.firstInvoiceNumber;
      if (dto.invoiceCount && !existing.invoiceCount) mergeData.invoiceCount = dto.invoiceCount;
      // Merge NC fields
      if (dto.ncExemptBs && !existing.ncExemptBs) mergeData.ncExemptBs = dto.ncExemptBs;
      if (dto.ncTaxBase1Bs && !existing.ncTaxBase1Bs) mergeData.ncTaxBase1Bs = dto.ncTaxBase1Bs;
      if (dto.ncTax1Bs && !existing.ncTax1Bs) mergeData.ncTax1Bs = dto.ncTax1Bs;
      if (dto.igtfNcTaxBs && !existing.igtfNcTaxBs) mergeData.igtfNcTaxBs = dto.igtfNcTaxBs;
      if (dto.lastCreditNoteNumber && !existing.lastCreditNoteNumber) mergeData.lastCreditNoteNumber = dto.lastCreditNoteNumber;
      if (dto.firstCreditNoteNumber && !existing.firstCreditNoteNumber) mergeData.firstCreditNoteNumber = dto.firstCreditNoteNumber;
      if (dto.creditNoteCount && !existing.creditNoteCount) mergeData.creditNoteCount = dto.creditNoteCount;
      // Merge ND fields
      if (dto.ndExemptBs && !existing.ndExemptBs) mergeData.ndExemptBs = dto.ndExemptBs;
      if (dto.ndTaxBase1Bs && !existing.ndTaxBase1Bs) mergeData.ndTaxBase1Bs = dto.ndTaxBase1Bs;
      if (dto.ndTax1Bs && !existing.ndTax1Bs) mergeData.ndTax1Bs = dto.ndTax1Bs;
      if (dto.igtfNdTaxBs && !existing.igtfNdTaxBs) mergeData.igtfNdTaxBs = dto.igtfNdTaxBs;
      if (dto.lastDebitNoteNumber && !existing.lastDebitNoteNumber) mergeData.lastDebitNoteNumber = dto.lastDebitNoteNumber;
      if (dto.firstDebitNoteNumber && !existing.firstDebitNoteNumber) mergeData.firstDebitNoteNumber = dto.firstDebitNoteNumber;
      if (dto.debitNoteCount && !existing.debitNoteCount) mergeData.debitNoteCount = dto.debitNoteCount;
      // Notes
      if (dto.notes && !existing.notes) mergeData.notes = dto.notes;

      if (Object.keys(mergeData).length === 0) {
        throw new ConflictException(
          `Ya existe un Reporte Z #${dto.zNumber} para la máquina ${dto.machineSerial} y no hay datos nuevos que agregar`,
        );
      }

      return this.prisma.zReport.update({
        where: { id: existing.id },
        data: mergeData,
        include: {
          cashRegister: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });
    }

    // Auto-derive firstInvoiceNumber and firstCreditNoteNumber from previous Z
    let firstInvoiceNumber = dto.firstInvoiceNumber || null;
    let firstCreditNoteNumber = dto.firstCreditNoteNumber || null;
    let firstDebitNoteNumber = dto.firstDebitNoteNumber || null;

    if (!firstInvoiceNumber || !firstCreditNoteNumber) {
      const previousZ = await this.prisma.zReport.findFirst({
        where: {
          machineSerial: dto.machineSerial,
          zNumber: { lt: dto.zNumber },
        },
        orderBy: { zNumber: 'desc' },
        select: {
          lastInvoiceNumber: true,
          lastCreditNoteNumber: true,
          lastDebitNoteNumber: true,
        },
      });

      if (previousZ) {
        if (!firstInvoiceNumber && previousZ.lastInvoiceNumber) {
          const prev = parseInt(previousZ.lastInvoiceNumber, 10);
          firstInvoiceNumber = isNaN(prev) ? previousZ.lastInvoiceNumber : String(prev + 1);
        }
        if (!firstCreditNoteNumber && previousZ.lastCreditNoteNumber) {
          const prev = parseInt(previousZ.lastCreditNoteNumber, 10);
          firstCreditNoteNumber = isNaN(prev) ? previousZ.lastCreditNoteNumber : String(prev + 1);
        }
        if (!firstDebitNoteNumber && previousZ.lastDebitNoteNumber) {
          const prev = parseInt(previousZ.lastDebitNoteNumber, 10);
          firstDebitNoteNumber = isNaN(prev) ? previousZ.lastDebitNoteNumber : String(prev + 1);
        }
      }
    }

    return this.prisma.zReport.create({
      data: {
        zNumber: dto.zNumber,
        reportDate: (() => { const d = new Date(dto.reportDate); d.setUTCHours(12, 0, 0, 0); return d; })(),
        machineSerial: dto.machineSerial,
        cashRegisterId: dto.cashRegisterId || null,

        salesExemptBs: dto.salesExemptBs || 0,
        salesTaxBase1Bs: dto.salesTaxBase1Bs || 0,
        salesTax1Bs: dto.salesTax1Bs || 0,
        salesTaxBase2Bs: dto.salesTaxBase2Bs || 0,
        salesTax2Bs: dto.salesTax2Bs || 0,
        salesTaxBase3Bs: dto.salesTaxBase3Bs || 0,
        salesTax3Bs: dto.salesTax3Bs || 0,

        ncExemptBs: dto.ncExemptBs || 0,
        ncTaxBase1Bs: dto.ncTaxBase1Bs || 0,
        ncTax1Bs: dto.ncTax1Bs || 0,
        ncTaxBase2Bs: dto.ncTaxBase2Bs || 0,
        ncTax2Bs: dto.ncTax2Bs || 0,
        ncTaxBase3Bs: dto.ncTaxBase3Bs || 0,
        ncTax3Bs: dto.ncTax3Bs || 0,

        ndExemptBs: dto.ndExemptBs || 0,
        ndTaxBase1Bs: dto.ndTaxBase1Bs || 0,
        ndTax1Bs: dto.ndTax1Bs || 0,
        ndTaxBase2Bs: dto.ndTaxBase2Bs || 0,
        ndTax2Bs: dto.ndTax2Bs || 0,
        ndTaxBase3Bs: dto.ndTaxBase3Bs || 0,
        ndTax3Bs: dto.ndTax3Bs || 0,

        igtfSalesBaseBs: dto.igtfSalesBaseBs || 0,
        igtfSalesTaxBs: dto.igtfSalesTaxBs || 0,
        igtfNcBaseBs: dto.igtfNcBaseBs || 0,
        igtfNcTaxBs: dto.igtfNcTaxBs || 0,
        igtfNdBaseBs: dto.igtfNdBaseBs || 0,
        igtfNdTaxBs: dto.igtfNdTaxBs || 0,

        lastInvoiceNumber: dto.lastInvoiceNumber || null,
        firstInvoiceNumber,
        invoiceCount: dto.invoiceCount || 0,
        lastCreditNoteNumber: dto.lastCreditNoteNumber || null,
        firstCreditNoteNumber,
        creditNoteCount: dto.creditNoteCount || 0,
        lastDebitNoteNumber: dto.lastDebitNoteNumber || null,
        firstDebitNoteNumber,
        debitNoteCount: dto.debitNoteCount || 0,

        isManual: dto.isManual ?? true,
        printerFamily: dto.printerFamily || null,
        rawResponse: dto.rawResponse || null,
        notes: dto.notes || null,

        createdById: userId,
      },
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateZReportDto) {
    const report = await this.prisma.zReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Reporte Z no encontrado');
    }

    const data: any = {};
    if (dto.zNumber !== undefined) data.zNumber = dto.zNumber;
    if (dto.reportDate !== undefined) { const d = new Date(dto.reportDate); d.setUTCHours(12, 0, 0, 0); data.reportDate = d; }
    if (dto.machineSerial !== undefined) data.machineSerial = dto.machineSerial;

    if (dto.salesExemptBs !== undefined) data.salesExemptBs = dto.salesExemptBs;
    if (dto.salesTaxBase1Bs !== undefined) data.salesTaxBase1Bs = dto.salesTaxBase1Bs;
    if (dto.salesTax1Bs !== undefined) data.salesTax1Bs = dto.salesTax1Bs;
    if (dto.salesTaxBase2Bs !== undefined) data.salesTaxBase2Bs = dto.salesTaxBase2Bs;
    if (dto.salesTax2Bs !== undefined) data.salesTax2Bs = dto.salesTax2Bs;
    if (dto.salesTaxBase3Bs !== undefined) data.salesTaxBase3Bs = dto.salesTaxBase3Bs;
    if (dto.salesTax3Bs !== undefined) data.salesTax3Bs = dto.salesTax3Bs;

    if (dto.ncExemptBs !== undefined) data.ncExemptBs = dto.ncExemptBs;
    if (dto.ncTaxBase1Bs !== undefined) data.ncTaxBase1Bs = dto.ncTaxBase1Bs;
    if (dto.ncTax1Bs !== undefined) data.ncTax1Bs = dto.ncTax1Bs;
    if (dto.ncTaxBase2Bs !== undefined) data.ncTaxBase2Bs = dto.ncTaxBase2Bs;
    if (dto.ncTax2Bs !== undefined) data.ncTax2Bs = dto.ncTax2Bs;
    if (dto.ncTaxBase3Bs !== undefined) data.ncTaxBase3Bs = dto.ncTaxBase3Bs;
    if (dto.ncTax3Bs !== undefined) data.ncTax3Bs = dto.ncTax3Bs;

    if (dto.ndExemptBs !== undefined) data.ndExemptBs = dto.ndExemptBs;
    if (dto.ndTaxBase1Bs !== undefined) data.ndTaxBase1Bs = dto.ndTaxBase1Bs;
    if (dto.ndTax1Bs !== undefined) data.ndTax1Bs = dto.ndTax1Bs;
    if (dto.ndTaxBase2Bs !== undefined) data.ndTaxBase2Bs = dto.ndTaxBase2Bs;
    if (dto.ndTax2Bs !== undefined) data.ndTax2Bs = dto.ndTax2Bs;
    if (dto.ndTaxBase3Bs !== undefined) data.ndTaxBase3Bs = dto.ndTaxBase3Bs;
    if (dto.ndTax3Bs !== undefined) data.ndTax3Bs = dto.ndTax3Bs;

    if (dto.igtfSalesBaseBs !== undefined) data.igtfSalesBaseBs = dto.igtfSalesBaseBs;
    if (dto.igtfSalesTaxBs !== undefined) data.igtfSalesTaxBs = dto.igtfSalesTaxBs;
    if (dto.igtfNcBaseBs !== undefined) data.igtfNcBaseBs = dto.igtfNcBaseBs;
    if (dto.igtfNcTaxBs !== undefined) data.igtfNcTaxBs = dto.igtfNcTaxBs;
    if (dto.igtfNdBaseBs !== undefined) data.igtfNdBaseBs = dto.igtfNdBaseBs;
    if (dto.igtfNdTaxBs !== undefined) data.igtfNdTaxBs = dto.igtfNdTaxBs;

    if (dto.lastInvoiceNumber !== undefined) data.lastInvoiceNumber = dto.lastInvoiceNumber;
    if (dto.firstInvoiceNumber !== undefined) data.firstInvoiceNumber = dto.firstInvoiceNumber;
    if (dto.invoiceCount !== undefined) data.invoiceCount = dto.invoiceCount;
    if (dto.lastCreditNoteNumber !== undefined) data.lastCreditNoteNumber = dto.lastCreditNoteNumber;
    if (dto.firstCreditNoteNumber !== undefined) data.firstCreditNoteNumber = dto.firstCreditNoteNumber;
    if (dto.creditNoteCount !== undefined) data.creditNoteCount = dto.creditNoteCount;
    if (dto.lastDebitNoteNumber !== undefined) data.lastDebitNoteNumber = dto.lastDebitNoteNumber;
    if (dto.firstDebitNoteNumber !== undefined) data.firstDebitNoteNumber = dto.firstDebitNoteNumber;
    if (dto.debitNoteCount !== undefined) data.debitNoteCount = dto.debitNoteCount;

    if (dto.cashRegisterId !== undefined) data.cashRegisterId = dto.cashRegisterId;
    if (dto.isManual !== undefined) data.isManual = dto.isManual;
    if (dto.printerFamily !== undefined) data.printerFamily = dto.printerFamily;
    if (dto.rawResponse !== undefined) data.rawResponse = dto.rawResponse;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.zReport.update({
      where: { id },
      data,
      include: {
        cashRegister: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede eliminar Reportes Z');
    }

    const report = await this.prisma.zReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Reporte Z no encontrado');
    }

    await this.prisma.zReport.delete({ where: { id } });
    return { deleted: true };
  }

  async generatePdfData(from: string, to: string) {
    return this.findAll(from, to);
  }
}
