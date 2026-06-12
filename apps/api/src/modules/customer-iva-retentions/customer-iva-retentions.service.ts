import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerIvaRetentionDto } from './dto/create-customer-iva-retention.dto';
import { RegisterVoucherDto } from './dto/register-voucher.dto';

// Margen por redondeos de la máquina fiscal
const TOLERANCE_BS = 1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class CustomerIvaRetentionsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateNumber(tx: any): Promise<string> {
    const last = await tx.customerIvaRetention.findFirst({
      where: { number: { startsWith: 'RVC-' } },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.number.split('-')[1], 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `RVC-${String(next).padStart(4, '0')}`;
  }

  async create(dto: CreateCustomerIvaRetentionDto, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      include: {
        serie: { select: { isFiscal: true, isVatExempt: true } },
        customer: true,
        items: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!invoice.serie?.isFiscal || invoice.serie?.isVatExempt) {
      throw new BadRequestException('La factura no es de serie fiscal — no aplica retención de IVA');
    }
    if ((invoice.ivaBs || 0) <= 0) {
      throw new BadRequestException('La factura no tiene IVA — no aplica retención');
    }
    if (!invoice.customerId) {
      throw new BadRequestException('La factura no tiene cliente asignado');
    }

    // Una factura solo puede tener una retención activa (no anulada)
    const existingCount = await this.prisma.customerIvaRetention.count({
      where: { invoiceId: invoice.id, cancelledAt: null },
    });
    if (existingCount > 0) {
      throw new BadRequestException('Esta factura ya tiene una retención de IVA registrada');
    }

    const config = await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } });
    const pct = dto.retentionPct || config?.ivaRetentionPct || 75;
    const calculatedBs = round2(invoice.ivaBs * (pct / 100));
    const retentionBs = dto.retentionBs !== undefined ? round2(dto.retentionBs) : calculatedBs;

    if (Math.abs(retentionBs - calculatedBs) > TOLERANCE_BS) {
      throw new BadRequestException(
        `El monto (Bs ${retentionBs.toFixed(2)}) se desvía más de ${TOLERANCE_BS} Bs del cálculo teórico (Bs ${calculatedBs.toFixed(2)} = ${pct}% del IVA)`,
      );
    }

    const rate = invoice.exchangeRate || 0;
    const retentionUsd = rate > 0 ? round2(retentionBs / rate) : 0;

    // Base imponible = items no exentos
    let taxableBaseUsd = 0;
    for (const item of invoice.items) {
      if (item.ivaType !== 'EXEMPT') taxableBaseUsd += item.unitPrice * item.quantity;
    }
    taxableBaseUsd = round2(taxableBaseUsd);
    const taxableBaseBs = round2(taxableBaseUsd * rate);

    if (dto.voucherNumber && !/^\d{14}$/.test(dto.voucherNumber)) {
      throw new BadRequestException('El número de comprobante debe tener 14 dígitos');
    }
    if (dto.voucherNumber && !dto.voucherDate) {
      throw new BadRequestException('Debe indicar la fecha del comprobante');
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      const retention = await tx.customerIvaRetention.create({
        data: {
          number,
          invoiceId: invoice.id,
          customerId: invoice.customerId!,
          taxableBaseUsd,
          taxableBaseBs,
          ivaAmountUsd: invoice.ivaUsd || 0,
          ivaAmountBs: invoice.ivaBs || 0,
          retentionPct: pct,
          retentionUsd,
          retentionBs,
          exchangeRate: rate,
          notes: dto.notes || null,
          createdById: userId,
        },
        include: { invoice: { select: { number: true, controlNumber: true } }, customer: true },
      });

      // Caso reintegro: comprobante entregado de una vez → línea del libro de ventas inmediata
      if (dto.voucherNumber && dto.voucherDate) {
        return this.applyVoucherInTx(tx, retention.id, {
          voucherNumber: dto.voucherNumber,
          voucherDate: dto.voucherDate,
        }, userId);
      }
      return retention;
    });
  }

  // Lógica compartida de registro de comprobante (usada por create con voucher y por registerVoucher)
  private async applyVoucherInTx(
    tx: any,
    id: string,
    dto: { voucherNumber: string; voucherDate: string; retentionBs?: number },
    userId: string,
  ) {
    const retention = await tx.customerIvaRetention.findUnique({
      where: { id },
      include: {
        invoice: { select: { number: true, controlNumber: true, ivaBs: true } },
        customer: true,
      },
    });
    if (!retention) throw new NotFoundException('Retención no encontrada');
    if (retention.cancelledAt) throw new BadRequestException('La retención está anulada');
    if (retention.voucherNumber) throw new BadRequestException('La retención ya tiene comprobante registrado');

    let retentionBs = retention.retentionBs;
    let retentionUsd = retention.retentionUsd;
    if (dto.retentionBs !== undefined) {
      const adjusted = round2(dto.retentionBs);
      const calculated = round2(retention.ivaAmountBs * (retention.retentionPct / 100));
      if (Math.abs(adjusted - calculated) > TOLERANCE_BS) {
        throw new BadRequestException(
          `El monto del comprobante (Bs ${adjusted.toFixed(2)}) se desvía más de ${TOLERANCE_BS} Bs del cálculo teórico (Bs ${calculated.toFixed(2)})`,
        );
      }
      retentionBs = adjusted;
      retentionUsd = retention.exchangeRate > 0 ? round2(adjusted / retention.exchangeRate) : 0;
    }

    const voucherDate = new Date(dto.voucherDate);
    voucherDate.setUTCHours(12, 0, 0, 0);

    const entry = await tx.salesBookEntry.create({
      data: {
        invoiceId: retention.invoiceId,
        entryDate: voucherDate,
        invoiceNumber: retention.invoice?.number || '',
        controlNumber: retention.invoice?.controlNumber || null,
        customerName: retention.customer?.name || '',
        customerRif: retention.customer?.rif
          ? `${retention.customer.documentType || ''}${retention.customer.documentType ? '-' : ''}${retention.customer.rif}`
          : null,
        exemptAmountBs: 0,
        taxableBaseBs: 0,
        ivaAmountBs: retentionBs,
        igtfAmountBs: 0,
        totalBs: 0,
        isManual: false,
        isRetentionLine: true,
        notes: dto.voucherNumber, // la columna "Comp. de Retención" del libro lee notes
        createdById: userId,
      },
    });

    return tx.customerIvaRetention.update({
      where: { id },
      data: {
        voucherNumber: dto.voucherNumber,
        voucherDate,
        voucherReceivedAt: new Date(),
        retentionBs,
        retentionUsd,
        salesBookEntryId: entry.id,
      },
      include: { invoice: { select: { number: true, controlNumber: true } }, customer: true },
    });
  }

  async registerVoucher(id: string, dto: RegisterVoucherDto, userId: string) {
    return this.prisma.$transaction(async (tx) => this.applyVoucherInTx(tx, id, dto, userId));
  }

  async findAll(filters: { status?: string; search?: string; from?: string; to?: string; invoiceId?: string }) {
    const where: any = {};
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.status === 'pending-voucher') {
      where.voucherNumber = null;
      where.cancelledAt = null;
    } else if (filters.status === 'voucher-received') {
      where.voucherNumber = { not: null };
      where.cancelledAt = null;
    } else if (filters.status === 'cancelled') {
      where.cancelledAt = { not: null };
    }
    if (filters.search) {
      where.OR = [
        { number: { contains: filters.search, mode: 'insensitive' } },
        { voucherNumber: { contains: filters.search, mode: 'insensitive' } },
        { invoice: { number: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        const d = new Date(filters.from);
        d.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = d;
      }
      if (filters.to) {
        const d = new Date(filters.to);
        d.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }
    return this.prisma.customerIvaRetention.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true, controlNumber: true, totalBs: true } },
        customer: { select: { id: true, name: true, rif: true, documentType: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async pendingCount() {
    const count = await this.prisma.customerIvaRetention.count({
      where: { voucherNumber: null, cancelledAt: null },
    });
    return { count };
  }

  async cancel(id: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new BadRequestException('Solo ADMIN puede anular retenciones');
    }
    const retention = await this.prisma.customerIvaRetention.findUnique({ where: { id } });
    if (!retention) throw new NotFoundException('Retención no encontrada');
    if (retention.cancelledAt) throw new BadRequestException('La retención ya está anulada');
    if (retention.appliedAt) {
      throw new BadRequestException('La retención ya fue aplicada en un recibo de cobro — anule el recibo primero');
    }
    return this.prisma.$transaction(async (tx) => {
      if (retention.salesBookEntryId) {
        await tx.customerIvaRetention.update({ where: { id }, data: { salesBookEntryId: null } });
        await tx.salesBookEntry.delete({ where: { id: retention.salesBookEntryId } });
      }
      return tx.customerIvaRetention.update({
        where: { id },
        data: { cancelledAt: new Date() },
      });
    });
  }
}
