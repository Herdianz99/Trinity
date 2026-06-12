import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesBookEntryDto } from './dto/create-sales-book-entry.dto';
import { UpdateSalesBookEntryDto } from './dto/update-sales-book-entry.dto';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class SalesBookService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(from: string, to: string) {
    const fromDate = new Date(from);
    fromDate.setUTCHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setUTCHours(23, 59, 59, 999);

    const entries = await this.prisma.salesBookEntry.findMany({
      where: {
        entryDate: { gte: fromDate, lte: toDate },
      },
      include: {
        invoice: {
          select: { id: true, number: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { entryDate: 'asc' },
    });

    let totalExempt = 0;
    let totalTaxableBase = 0;
    let totalIva = 0;
    let totalIgtf = 0;
    let totalAmount = 0;

    for (const entry of entries) {
      if (entry.isRetentionLine) continue; // el IVA retenido no es débito fiscal
      totalExempt += entry.exemptAmountBs;
      totalTaxableBase += entry.taxableBaseBs;
      totalIva += entry.ivaAmountBs;
      totalIgtf += entry.igtfAmountBs;
      totalAmount += entry.totalBs;
    }

    return {
      periodo: { from: fromDate, to: toDate },
      entries,
      totales: {
        totalEntries: entries.length,
        exemptAmountBs: round2(totalExempt),
        taxableBaseBs: round2(totalTaxableBase),
        ivaAmountBs: round2(totalIva),
        igtfAmountBs: round2(totalIgtf),
        totalBs: round2(totalAmount),
      },
    };
  }

  async create(dto: CreateSalesBookEntryDto, userId: string) {
    return this.prisma.salesBookEntry.create({
      data: {
        entryDate: new Date(dto.entryDate),
        invoiceNumber: dto.invoiceNumber,
        controlNumber: dto.controlNumber || null,
        customerName: dto.customerName,
        customerRif: dto.customerRif || null,
        exemptAmountBs: dto.exemptAmountBs || 0,
        taxableBaseBs: dto.taxableBaseBs || 0,
        ivaAmountBs: dto.ivaAmountBs || 0,
        igtfAmountBs: dto.igtfAmountBs || 0,
        totalBs: dto.totalBs || 0,
        isManual: true,
        notes: dto.notes || null,
        createdById: userId,
      },
      include: {
        invoice: {
          select: { id: true, number: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, dto: UpdateSalesBookEntryDto) {
    const entry = await this.prisma.salesBookEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada del libro de ventas no encontrada');
    }

    const data: any = {};
    if (dto.entryDate !== undefined) data.entryDate = new Date(dto.entryDate);
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.controlNumber !== undefined) data.controlNumber = dto.controlNumber;
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.customerRif !== undefined) data.customerRif = dto.customerRif;
    if (dto.exemptAmountBs !== undefined) data.exemptAmountBs = dto.exemptAmountBs;
    if (dto.taxableBaseBs !== undefined) data.taxableBaseBs = dto.taxableBaseBs;
    if (dto.ivaAmountBs !== undefined) data.ivaAmountBs = dto.ivaAmountBs;
    if (dto.igtfAmountBs !== undefined) data.igtfAmountBs = dto.igtfAmountBs;
    if (dto.totalBs !== undefined) data.totalBs = dto.totalBs;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.salesBookEntry.update({
      where: { id },
      data,
      include: {
        invoice: {
          select: { id: true, number: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Solo ADMIN puede eliminar entradas del libro de ventas');
    }

    const entry = await this.prisma.salesBookEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Entrada del libro de ventas no encontrada');
    }

    await this.prisma.salesBookEntry.delete({ where: { id } });
    return { deleted: true };
  }

  async generatePdfData(from: string, to: string) {
    const data = await this.findAll(from, to);

    const summary = {
      periodo: { from, to },
      ventasExentas: data.totales.exemptAmountBs,
      baseImponibleGeneral: data.totales.taxableBaseBs,
      debitoFiscalGeneral: data.totales.ivaAmountBs,
      totalBaseImponible: data.totales.taxableBaseBs,
      totalDebitoFiscal: data.totales.ivaAmountBs,
      totalIgtf: data.totales.igtfAmountBs,
      totalVentas: data.totales.totalBs,
    };

    return {
      ...data,
      summary,
    };
  }
}
