import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { writeCashLedger } from '../../common/cash-ledger';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';
import { QueryPendingDocumentsDto } from './dto/query-pending-documents.dto';
import { caracasDayStart, caracasDayEnd, caracasDateKey } from '../../common/timezone';

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  async findAll(query: QueryReceiptsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;
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
      this.prisma.receipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, rif: true } },
          supplier: { select: { id: true, name: true, rif: true } },
          items: true,
        },
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        customer: true,
        supplier: true,
        items: {
          include: {
            receivable: {
              select: { id: true, invoice: { select: { id: true, number: true } }, amountUsd: true, amountBs: true, exchangeRate: true, status: true },
            },
            payable: {
              select: { id: true, purchaseOrder: { select: { id: true, number: true } }, netPayableUsd: true, netPayableBs: true, exchangeRate: true, status: true },
            },
            creditDebitNote: {
              select: { id: true, number: true, type: true, totalUsd: true, totalBs: true },
            },
          },
        },
        payments: {
          include: { method: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    return receipt;
  }

  async create(dto: CreateReceiptDto, userId: string) {
    // Validate entity
    if (dto.type === 'COLLECTION' && !dto.customerId && !dto.platformName) {
      throw new BadRequestException('Se requiere un cliente o plataforma para recibos de cobro');
    }
    if (dto.type === 'PAYMENT' && !dto.supplierId) {
      throw new BadRequestException('Se requiere un proveedor para recibos de pago');
    }
    if (!dto.itemIds || dto.itemIds.length === 0) {
      throw new BadRequestException('Debe incluir al menos un documento');
    }

    // Tasa efectiva para los Bs "de hoy" y el diferencial: la enviada en el recibo
    // (cobro = tasa de la fecha elegida; pago = tasa manual del proveedor) o, si no se
    // envia, la tasa del dia registrada.
    const today = caracasDateKey();
    const todayRate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    const effectiveRate = dto.exchangeRate && dto.exchangeRate > 0 ? dto.exchangeRate : todayRate?.rate;
    if (!effectiveRate || effectiveRate <= 0) {
      throw new BadRequestException('No hay tasa de cambio. Registre la tasa del dia o ingrese una tasa en el recibo.');
    }

    // Build items
    const items: Array<{
      itemType: 'RECEIVABLE' | 'PAYABLE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'IVA_RETENTION' | 'SALES_IVA_RETENTION' | 'PURCHASE_IVA_RETENTION' | 'PURCHASE_ISLR_RETENTION' | 'CUSTOMER_ADVANCE' | 'SUPPLIER_ADVANCE';
      receivableId?: string;
      payableId?: string;
      creditDebitNoteId?: string;
      ivaRetentionId?: string;
      customerIvaRetentionId?: string;
      retentionVoucherId?: string;
      islrRetentionVoucherId?: string;
      customerAdvanceId?: string;
      supplierAdvanceId?: string;
      description: string;
      amountUsd: number;
      amountBsHistoric: number;
      amountBsToday: number;
      differentialBs: number;
      sign: number;
    }> = [];

    for (const item of dto.itemIds) {
      if (item.receivableId) {
        const receivable = await this.prisma.receivable.findUnique({
          where: { id: item.receivableId },
          include: { invoice: { select: { number: true } } },
        });
        if (!receivable) throw new BadRequestException(`CxC ${item.receivableId} no encontrada`);
        if (receivable.status === 'PAID') throw new BadRequestException(`CxC ${receivable.invoice?.number || receivable.documentNumber || item.receivableId} ya está pagada`);

        const balanceUsd = this.round2(receivable.amountUsd - receivable.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        // Historic Bs: proportional to the original Bs amount
        const proportion = amountUsd / receivable.amountUsd;
        const amountBsHistoric = this.round2(receivable.amountBs * proportion);
        const amountBsToday = this.round2(amountUsd * effectiveRate);

        items.push({
          itemType: 'RECEIVABLE',
          receivableId: item.receivableId,
          description: receivable.invoice?.number || receivable.documentNumber || `CxC-${item.receivableId.slice(-6)}`,
          amountUsd,
          amountBsHistoric,
          amountBsToday,
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.payableId) {
        const payable = await this.prisma.payable.findUnique({
          where: { id: item.payableId },
          include: { purchaseOrder: { select: { number: true, supplierInvoiceNumber: true } } },
        });
        if (!payable) throw new BadRequestException(`CxP ${item.payableId} no encontrada`);
        if (payable.status === 'PAID') throw new BadRequestException(`CxP ${payable.purchaseOrder?.number || payable.documentNumber || item.payableId} ya está pagada`);

        const balanceUsd = this.round2(payable.netPayableUsd - payable.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        const proportion = amountUsd / payable.netPayableUsd;
        const amountBsHistoric = this.round2(payable.netPayableBs * proportion);
        const amountBsToday = this.round2(amountUsd * effectiveRate);

        items.push({
          itemType: 'PAYABLE',
          payableId: item.payableId,
          // N° de documento del PROVEEDOR primero; la "descripcion" (texto libre) solo como
          // ultimo recurso para CxP de gasto que no tienen documento de proveedor.
          description: payable.documentNumber || payable.purchaseOrder?.supplierInvoiceNumber || payable.purchaseOrder?.number || payable.description || `CxP-${item.payableId.slice(-6)}`,
          amountUsd,
          amountBsHistoric,
          amountBsToday,
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.creditDebitNoteId) {
        const note = await this.prisma.creditDebitNote.findUnique({
          where: { id: item.creditDebitNoteId },
          include: { invoice: { select: { number: true } }, purchaseOrder: { select: { number: true } } },
        });
        if (!note) throw new BadRequestException(`Nota ${item.creditDebitNoteId} no encontrada`);
        if (note.status !== 'POSTED') throw new BadRequestException(`Nota ${note.number} no está confirmada`);
        if (note.appliedAt) throw new BadRequestException(`Nota ${note.number} ya fue aplicada`);

        const isCredit = ['NCV', 'NCC'].includes(note.type);
        // Saldo restante de la nota: permite aplicarla/reintegrarla PARCIALMENTE (igual que el
        // saldo a favor del POS ya se consume parcial via paidAmountUsd). Antes se forzaba el
        // total, asi que si parte de la nota ya se habia usado en una compra, no se podia
        // reintegrar solo el restante.
        const remaining = this.round2(note.totalUsd - (note.paidAmountUsd || 0));
        if (remaining <= 0.01) throw new BadRequestException(`Nota ${note.number} ya fue aplicada completamente`);
        const amountUsd = item.amountUsd ? Math.min(this.round2(item.amountUsd), remaining) : remaining;
        const proportion = note.totalUsd > 0 ? amountUsd / note.totalUsd : 0;
        const amountBsHistoric = this.round2(note.totalBs * proportion);
        const amountBsToday = this.round2(amountUsd * effectiveRate);

        items.push({
          itemType: isCredit ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
          creditDebitNoteId: item.creditDebitNoteId,
          description: `${note.number} (${note.invoice?.number || note.purchaseOrder?.number || ''})`,
          amountUsd,
          amountBsHistoric,
          amountBsToday,
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.ivaRetentionId) {
        const retention = await this.prisma.ivaRetention.findUnique({
          where: { id: item.ivaRetentionId },
          include: { purchaseOrder: { select: { number: true } } },
        });
        if (!retention) throw new BadRequestException(`Retencion ${item.ivaRetentionId} no encontrada`);
        if (retention.appliedAt) throw new BadRequestException(`Retencion ${retention.number} ya fue aplicada`);

        items.push({
          itemType: 'IVA_RETENTION',
          ivaRetentionId: item.ivaRetentionId,
          description: `Ret. IVA ${retention.number} (${retention.purchaseOrder?.number || ''})`,
          amountUsd: retention.retentionUsd,
          amountBsHistoric: retention.retentionBs,
          amountBsToday: this.round2(retention.retentionUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.retentionVoucherId) {
        const v = await this.prisma.retentionVoucher.findUnique({ where: { id: item.retentionVoucherId } });
        if (!v) throw new BadRequestException(`Retencion IVA ${item.retentionVoucherId} no encontrada`);
        if (v.status !== 'ISSUED') throw new BadRequestException(`La retencion IVA ${v.number} no esta emitida`);
        if (v.appliedAt) throw new BadRequestException(`La retencion IVA ${v.number} ya fue aplicada`);
        items.push({
          itemType: 'PURCHASE_IVA_RETENTION',
          retentionVoucherId: item.retentionVoucherId,
          description: `Ret. IVA ${v.number}`,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          amountBsToday: this.round2(v.retentionAmountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.islrRetentionVoucherId) {
        const v = await this.prisma.islrRetentionVoucher.findUnique({ where: { id: item.islrRetentionVoucherId } });
        if (!v) throw new BadRequestException(`Retencion ISLR ${item.islrRetentionVoucherId} no encontrada`);
        if (v.status !== 'ISSUED') throw new BadRequestException(`La retencion ISLR ${v.number} no esta emitida`);
        if (v.appliedAt) throw new BadRequestException(`La retencion ISLR ${v.number} ya fue aplicada`);
        items.push({
          itemType: 'PURCHASE_ISLR_RETENTION',
          islrRetentionVoucherId: item.islrRetentionVoucherId,
          description: `Ret. ISLR ${v.number}`,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          amountBsToday: this.round2(v.retentionAmountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.customerIvaRetentionId) {
        const retention = await this.prisma.customerIvaRetention.findUnique({
          where: { id: item.customerIvaRetentionId },
          include: { invoice: { select: { number: true } } },
        });
        if (!retention) throw new BadRequestException(`Retención ${item.customerIvaRetentionId} no encontrada`);
        if (retention.appliedAt) throw new BadRequestException(`Retención ${retention.number} ya fue aplicada`);
        if (retention.cancelledAt) throw new BadRequestException(`Retención ${retention.number} está anulada`);

        items.push({
          itemType: 'SALES_IVA_RETENTION',
          customerIvaRetentionId: item.customerIvaRetentionId,
          description: `Ret. IVA ${retention.number} (${retention.invoice?.number || ''})`,
          amountUsd: retention.retentionUsd,
          amountBsHistoric: retention.retentionBs,
          amountBsToday: this.round2(retention.retentionUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.customerAdvanceId) {
        // Anticipo de cliente (saldo a favor) = credito que resta de lo que se cobra
        const advance = await this.prisma.customerAdvance.findUnique({
          where: { id: item.customerAdvanceId },
          include: { customer: { select: { name: true } } },
        });
        if (!advance) throw new BadRequestException(`Anticipo ${item.customerAdvanceId} no encontrado`);
        if (advance.status === 'CONSUMED') throw new BadRequestException(`El anticipo de ${advance.customer?.name || 'cliente'} ya está consumido`);
        const balanceUsd = this.round2(advance.amountUsd - advance.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        const proportion = advance.amountUsd > 0 ? amountUsd / advance.amountUsd : 0;
        items.push({
          itemType: 'CUSTOMER_ADVANCE',
          customerAdvanceId: item.customerAdvanceId,
          description: `Anticipo${advance.reference ? ' ' + advance.reference : ''} (saldo a favor)`,
          amountUsd,
          amountBsHistoric: this.round2(advance.amountBs * proportion),
          amountBsToday: this.round2(amountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.supplierAdvanceId) {
        // Anticipo a proveedor = credito que resta de lo que se paga (baja la deuda)
        const advance = await this.prisma.supplierAdvance.findUnique({
          where: { id: item.supplierAdvanceId },
          include: { supplier: { select: { name: true } } },
        });
        if (!advance) throw new BadRequestException(`Anticipo ${item.supplierAdvanceId} no encontrado`);
        if (advance.status === 'CONSUMED') throw new BadRequestException(`El anticipo a ${advance.supplier?.name || 'proveedor'} ya está consumido`);
        const balanceUsd = this.round2(advance.amountUsd - advance.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        const proportion = advance.amountUsd > 0 ? amountUsd / advance.amountUsd : 0;
        items.push({
          itemType: 'SUPPLIER_ADVANCE',
          supplierAdvanceId: item.supplierAdvanceId,
          description: `Anticipo${advance.reference ? ' ' + advance.reference : ''} (adelanto)`,
          amountUsd,
          amountBsHistoric: this.round2(advance.amountBs * proportion),
          amountBsToday: this.round2(amountUsd * effectiveRate),
          differentialBs: 0,
          sign: item.sign,
        });
      }
    }

    // Calculate totals
    let totalUsd = 0;
    let totalBsHistoric = 0;
    let totalBsToday = 0;

    for (const item of items) {
      totalUsd += item.amountUsd * item.sign;
      totalBsHistoric += item.amountBsHistoric * item.sign;
      totalBsToday += item.amountBsToday * item.sign;
    }

    totalUsd = this.round2(totalUsd);
    totalBsHistoric = this.round2(totalBsHistoric);
    totalBsToday = this.round2(totalBsToday);
    const differentialBs = this.round2(totalBsToday - totalBsHistoric);
    const hasDifferential = Math.abs(differentialBs) >= 0.01;

    // If there's a differential, create a DIFFERENTIAL item
    if (hasDifferential) {
      items.push({
        itemType: 'DIFFERENTIAL' as any,
        description: 'Diferencial Cambiario',
        amountUsd: 0,
        amountBsHistoric: 0,
        amountBsToday: 0,
        differentialBs,
        sign: 1,
      });
    }

    // Generate receipt number
    const prefix = dto.type === 'COLLECTION' ? 'RCB' : 'RPG';
    const lastReceipt = await this.prisma.receipt.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let nextNum = 1;
    if (lastReceipt) {
      const parts = lastReceipt.number.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const number = `${prefix}-${String(nextNum).padStart(4, '0')}`;

    // Create receipt in transaction
    const receipt = await this.prisma.$transaction(async (tx) => {
      return tx.receipt.create({
        data: {
          number,
          type: dto.type,
          customerId: dto.customerId || null,
          supplierId: dto.supplierId || null,
          status: 'DRAFT',
          totalUsd,
          totalBsHistoric,
          totalBsToday,
          exchangeRate: effectiveRate,
          differentialBs,
          hasDifferential,
          notes: dto.notes || null,
          createdById: userId,
          items: {
            create: items.map((item) => ({
              itemType: item.itemType,
              receivableId: item.receivableId || null,
              payableId: item.payableId || null,
              creditDebitNoteId: item.creditDebitNoteId || null,
              ivaRetentionId: item.ivaRetentionId || null,
              customerIvaRetentionId: item.customerIvaRetentionId || null,
              retentionVoucherId: item.retentionVoucherId || null,
              islrRetentionVoucherId: item.islrRetentionVoucherId || null,
              customerAdvanceId: item.customerAdvanceId || null,
              supplierAdvanceId: item.supplierAdvanceId || null,
              description: item.description,
              amountUsd: item.amountUsd,
              amountBsHistoric: item.amountBsHistoric,
              amountBsToday: item.amountBsToday,
              differentialBs: item.differentialBs,
              sign: item.sign,
            })),
          },
        },
        include: {
          customer: true,
          supplier: true,
          items: {
            include: {
              receivable: { select: { id: true, invoice: { select: { number: true } } } },
              payable: { select: { id: true, purchaseOrder: { select: { number: true } } } },
            },
          },
        },
      });
    });

    return receipt;
  }

  async post(id: string, dto: PostReceiptDto, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            receivable: true,
            payable: true,
          },
        },
      },
    });

    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    if (receipt.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden procesar recibos en borrador');
    }

    // Usar la tasa del recibo (editable: cobro por fecha / pago manual). Fallback a la de hoy.
    const today = caracasDateKey();
    const todayRate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    const postRate = receipt.exchangeRate && receipt.exchangeRate > 0 ? receipt.exchangeRate : todayRate?.rate;
    if (!postRate || postRate <= 0) {
      throw new BadRequestException('No hay tasa de cambio para procesar el recibo');
    }

    // Validate payments total
    const totalPaymentUsd = dto.payments.reduce((sum, p) => sum + p.amountUsd, 0);
    const netAbsUsd = Math.abs(receipt.totalUsd);
    if (this.round2(totalPaymentUsd) < this.round2(netAbsUsd) - 0.01) {
      throw new BadRequestException(
        `La suma de pagos ($${this.round2(totalPaymentUsd).toFixed(2)}) es menor al saldo neto ($${this.round2(netAbsUsd).toFixed(2)})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Process each item
      for (const item of receipt.items) {
        if (item.itemType === 'RECEIVABLE' && item.receivableId && item.receivable) {
          // Releer fresco dentro de la tx y validar saldo: evita doble-cobro si otro recibo
          // (otro borrador del mismo documento) ya lo cobro antes de postear este.
          const receivable = await tx.receivable.findUnique({ where: { id: item.receivableId } });
          if (!receivable) throw new BadRequestException('La cuenta por cobrar ya no existe');
          const payAmount = item.amountUsd;
          const balanceUsd = this.round2(receivable.amountUsd - receivable.paidAmountUsd);
          if (payAmount > balanceUsd + 0.01) {
            throw new BadRequestException(
              `'${item.description}' ya no tiene saldo suficiente (saldo: $${balanceUsd.toFixed(2)}). Posiblemente ya fue cobrado por otro recibo.`,
            );
          }
          const amountBs = this.round2(payAmount * postRate);
          const newPaidUsd = this.round2(receivable.paidAmountUsd + payAmount);
          const newPaidBs = this.round2(receivable.paidAmountBs + amountBs);
          const isPaid = newPaidUsd >= receivable.amountUsd - 0.01;

          await tx.receivablePayment.create({
            data: {
              receivableId: item.receivableId,
              receiptId: receipt.id,
              amountUsd: payAmount,
              amountBs,
              exchangeRate: postRate,
              // metodo de referencia; null en un cruce a cero (sin pago en efectivo)
              methodId: dto.payments[0]?.methodId || null,
              reference: `Recibo ${receipt.number}`,
              cashSessionId: dto.cashSessionId || null,
              notes: `Aplicado via recibo ${receipt.number}`,
              createdById: userId,
            },
          });

          await tx.receivable.update({
            where: { id: item.receivableId },
            data: {
              paidAmountUsd: newPaidUsd,
              paidAmountBs: newPaidBs,
              status: isPaid ? 'PAID' : 'PARTIAL',
              paidAt: isPaid ? new Date() : null,
            },
          });
        } else if (item.itemType === 'PAYABLE' && item.payableId && item.payable) {
          // Releer fresco dentro de la tx y validar saldo: evita doble-pago si otro recibo
          // (otro borrador del mismo documento) ya lo pago antes de postear este.
          const payable = await tx.payable.findUnique({ where: { id: item.payableId } });
          if (!payable) throw new BadRequestException('El documento por pagar ya no existe');
          const payAmount = item.amountUsd;
          const balanceUsd = this.round2(payable.netPayableUsd - payable.paidAmountUsd);
          if (payAmount > balanceUsd + 0.01) {
            throw new BadRequestException(
              `'${item.description}' ya no tiene saldo suficiente (saldo: $${balanceUsd.toFixed(2)}). Posiblemente ya fue pagado por otro recibo.`,
            );
          }
          const amountBs = this.round2(payAmount * postRate);
          const newPaidUsd = this.round2(payable.paidAmountUsd + payAmount);
          const newPaidBs = this.round2(payable.paidAmountBs + amountBs);
          const isPaid = newPaidUsd >= payable.netPayableUsd - 0.01;

          await tx.payablePayment.create({
            data: {
              payableId: item.payableId,
              receiptId: receipt.id,
              amountUsd: payAmount,
              amountBs,
              exchangeRate: postRate,
              // metodo de referencia; null en un cruce a cero (sin pago en efectivo)
              methodId: dto.payments[0]?.methodId || null,
              reference: `Recibo ${receipt.number}`,
              notes: `Aplicado via recibo ${receipt.number}`,
              createdById: userId,
            },
          });

          await tx.payable.update({
            where: { id: item.payableId },
            data: {
              paidAmountUsd: newPaidUsd,
              paidAmountBs: newPaidBs,
              status: isPaid ? 'PAID' : 'PARTIAL',
              paidAt: isPaid ? new Date() : null,
            },
          });
        } else if ((item.itemType === 'CREDIT_NOTE' || item.itemType === 'DEBIT_NOTE') && item.creditDebitNoteId) {
          // Aplicacion PARCIAL: sumar al paidAmountUsd de la nota (no marcar todo aplicado).
          // Re-leer fresco dentro de la tx para validar el saldo (evita doble aplicacion si
          // otro recibo la aplico antes). Solo se marca appliedAt cuando se consume del todo.
          const note = await tx.creditDebitNote.findUnique({ where: { id: item.creditDebitNoteId } });
          if (!note) throw new BadRequestException('La nota ya no existe');
          const remaining = this.round2(note.totalUsd - (note.paidAmountUsd || 0));
          if (item.amountUsd > remaining + 0.01) {
            throw new BadRequestException(
              `La nota ${note.number} ya no tiene saldo suficiente (restante: $${remaining.toFixed(2)}). Posiblemente ya fue aplicada por otro recibo.`,
            );
          }
          const newPaid = this.round2((note.paidAmountUsd || 0) + item.amountUsd);
          const fullyApplied = newPaid >= this.round2(note.totalUsd) - 0.01;
          await tx.creditDebitNote.update({
            where: { id: item.creditDebitNoteId },
            data: { paidAmountUsd: newPaid, ...(fullyApplied ? { appliedAt: new Date() } : {}) },
          });
        } else if (item.itemType === 'IVA_RETENTION' && item.ivaRetentionId) {
          // Mark IVA retention as applied
          await tx.ivaRetention.update({
            where: { id: item.ivaRetentionId },
            data: { appliedAt: new Date() },
          });
        } else if (item.itemType === 'SALES_IVA_RETENTION' && item.customerIvaRetentionId) {
          // Mark customer IVA retention (sales side) as applied
          await tx.customerIvaRetention.update({
            where: { id: item.customerIvaRetentionId },
            data: { appliedAt: new Date() },
          });
        } else if (item.itemType === 'PURCHASE_IVA_RETENTION' && item.retentionVoucherId) {
          await tx.retentionVoucher.update({ where: { id: item.retentionVoucherId }, data: { appliedAt: new Date() } });
        } else if (item.itemType === 'PURCHASE_ISLR_RETENTION' && item.islrRetentionVoucherId) {
          await tx.islrRetentionVoucher.update({ where: { id: item.islrRetentionVoucherId }, data: { appliedAt: new Date() } });
        } else if (item.itemType === 'CUSTOMER_ADVANCE' && item.customerAdvanceId) {
          // Consumir el anticipo del cliente (no toca caja: ya movió caja al crearse)
          const advance = await tx.customerAdvance.findUnique({ where: { id: item.customerAdvanceId } });
          if (!advance) throw new BadRequestException('El anticipo ya no existe');
          const remaining = this.round2(advance.amountUsd - advance.paidAmountUsd);
          if (item.amountUsd > remaining + 0.01) {
            throw new BadRequestException(`El anticipo ya no tiene saldo suficiente (restante: $${remaining.toFixed(2)}).`);
          }
          const newPaidUsd = this.round2(advance.paidAmountUsd + item.amountUsd);
          const newPaidBs = this.round2(advance.paidAmountBs + item.amountBsHistoric);
          const fullyConsumed = newPaidUsd >= this.round2(advance.amountUsd) - 0.01;
          await tx.customerAdvance.update({
            where: { id: item.customerAdvanceId },
            data: { paidAmountUsd: newPaidUsd, paidAmountBs: newPaidBs, status: fullyConsumed ? 'CONSUMED' : 'PARTIAL' },
          });
        } else if (item.itemType === 'SUPPLIER_ADVANCE' && item.supplierAdvanceId) {
          // Consumir el anticipo al proveedor (no toca caja: ya movió caja al crearse)
          const advance = await tx.supplierAdvance.findUnique({ where: { id: item.supplierAdvanceId } });
          if (!advance) throw new BadRequestException('El anticipo ya no existe');
          const remaining = this.round2(advance.amountUsd - advance.paidAmountUsd);
          if (item.amountUsd > remaining + 0.01) {
            throw new BadRequestException(`El anticipo ya no tiene saldo suficiente (restante: $${remaining.toFixed(2)}).`);
          }
          const newPaidUsd = this.round2(advance.paidAmountUsd + item.amountUsd);
          const newPaidBs = this.round2(advance.paidAmountBs + item.amountBsHistoric);
          const fullyConsumed = newPaidUsd >= this.round2(advance.amountUsd) - 0.01;
          await tx.supplierAdvance.update({
            where: { id: item.supplierAdvanceId },
            data: { paidAmountUsd: newPaidUsd, paidAmountBs: newPaidBs, status: fullyConsumed ? 'CONSUMED' : 'PARTIAL' },
          });
        }
        // DIFFERENTIAL items don't generate CxC/CxP movements
      }

      // Reintegro = recibo de cobro con total negativo (sale dinero). Sus pagos NO se cuentan
      // como cobro; se cuenta el egreso (como en el arqueo actual).
      const isReintegro = receipt.type === 'COLLECTION' && receipt.totalUsd < -0.01;

      // Metodos de los pagos del recibo (para isCash/moneda del ledger)
      const rMethodIds = [...new Set(dto.payments.map((p) => p.methodId).filter(Boolean))];
      const rMethods = rMethodIds.length
        ? await tx.paymentMethod.findMany({ where: { id: { in: rMethodIds } }, select: { id: true, isCash: true, isDivisa: true } })
        : [];
      const rMethodMap = new Map(rMethods.map((m) => [m.id, m]));

      // Create payment records on the receipt (+ fila del ledger por cada pago)
      for (const payment of dto.payments) {
        await tx.receiptPayment.create({
          data: {
            receiptId: receipt.id,
            methodId: payment.methodId,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: postRate,
            reference: payment.reference || null,
          },
        });
        if (dto.cashSessionId) {
          // UNA fila del ledger por CADA metodo, tal como se metio en caja (sin agrupar).
          // Reintegro (cobro negativo) = sale dinero -> OUT; cobro normal -> IN; pago -> OUT.
          const m = rMethodMap.get(payment.methodId);
          const isOut = isReintegro || receipt.type !== 'COLLECTION';
          await writeCashLedger(tx, {
            cashSessionId: dto.cashSessionId,
            direction: isOut ? 'OUT' : 'IN',
            amountUsd: payment.amountUsd, amountBs: payment.amountBs,
            currency: m?.isDivisa ? 'USD' : 'BS', exchangeRate: postRate,
            methodId: payment.methodId, isCash: !!m?.isCash,
            sourceType: isReintegro ? 'REINTEGRO' : (receipt.type === 'COLLECTION' ? 'RECEIPT_COLLECTION' : 'RECEIPT_PAYMENT'),
            sourceId: receipt.id, reason: `Recibo ${receipt.number}`, createdById: userId,
          });
        }
      }

      // Update receipt to POSTED
      const updated = await tx.receipt.update({
        where: { id },
        data: {
          status: 'POSTED',
          cashSessionId: dto.cashSessionId || null,
        },
        include: {
          customer: true,
          supplier: true,
          items: {
            include: {
              receivable: { select: { id: true, status: true, invoice: { select: { number: true } } } },
              payable: { select: { id: true, status: true, purchaseOrder: { select: { number: true } } } },
            },
          },
          payments: { include: { method: true } },
        },
      });

      return updated;
    });
  }

  async cancel(id: string) {
    const receipt = await this.prisma.receipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    if (receipt.status !== 'DRAFT') {
      throw new BadRequestException('Solo se pueden cancelar recibos en borrador');
    }

    return this.prisma.receipt.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        customer: true,
        supplier: true,
        items: true,
        payments: true,
      },
    });
  }

  // Eliminar (borrar de verdad) un recibo NO procesado (borrador o anulado), para que no ocupe
  // espacio. Un recibo en borrador no tiene pagos aplicados, asi que es seguro borrarlo.
  async remove(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      select: { id: true, status: true, number: true },
    });
    if (!receipt) throw new NotFoundException('Recibo no encontrado');
    if (receipt.status === 'POSTED') {
      throw new BadRequestException('No se puede eliminar un recibo procesado. Solo borradores o anulados.');
    }
    await this.prisma.$transaction([
      this.prisma.receiptItem.deleteMany({ where: { receiptId: id } }),
      this.prisma.receipt.delete({ where: { id } }),
    ]);
    return { message: `Recibo ${receipt.number} eliminado` };
  }

  async getPendingDocuments(query: QueryPendingDocumentsDto) {
    // Legacy support: type=PAYMENT + entityId → flat array of payables + notes
    if (query.type === 'PAYMENT' && query.entityId) {
      const where: any = {
        supplierId: query.entityId,
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      };

      if (query.search) {
        // Busca por N° de orden, N° de documento o descripcion (para CxP de gasto,
        // que no tienen orden de compra pero si descripcion "Gasto: ...").
        where.OR = [
          { purchaseOrder: { number: { contains: query.search, mode: 'insensitive' } } },
          { documentNumber: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const payables = await this.prisma.payable.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          purchaseOrder: { select: { id: true, number: true, supplierInvoiceNumber: true, createdAt: true } },
        },
      });

      // Fetch purchase notes (NCC/NDC) for this supplier's POs
      const supplierPOs = await this.prisma.purchaseOrder.findMany({
        where: { supplierId: query.entityId },
        select: { id: true },
      });
      const poIds = supplierPOs.map((po) => po.id);

      const purchaseNotes = poIds.length > 0 ? await this.prisma.creditDebitNote.findMany({
        where: {
          purchaseOrderId: { in: poIds },
          type: { in: ['NCC', 'NDC'] },
          status: 'POSTED',
          appliedAt: null,
        },
        include: {
          purchaseOrder: { select: { number: true } },
        },
        orderBy: { createdAt: 'asc' },
      }) : [];

      // Excluir payables que ya estan en un recibo en BORRADOR (evita crear borradores
      // duplicados del mismo documento, como paso con RPG-0001/2/3 al mismo doc).
      const draftPayableItems = await this.prisma.receiptItem.findMany({
        where: { payableId: { in: payables.map((p) => p.id) }, receipt: { status: 'DRAFT' } },
        select: { payableId: true },
      });
      const draftPayableIds = new Set(
        draftPayableItems.map((it) => it.payableId).filter(Boolean) as string[],
      );

      const payableDocs = payables.filter((p) => !draftPayableIds.has(p.id)).map((p) => ({
        id: p.id,
        documentType: 'CxP',
        payableId: p.id,
        description: (p as any).documentNumber || p.purchaseOrder?.supplierInvoiceNumber || p.purchaseOrder?.number || (p as any).description || `CxP-${p.id.slice(-6)}`,
        date: p.createdAt,
        dueDate: p.dueDate,
        amountUsd: p.netPayableUsd,
        amountBsHistoric: p.netPayableBs,
        exchangeRate: p.exchangeRate,
        balanceUsd: this.round2(p.netPayableUsd - p.paidAmountUsd),
        status: p.status,
      }));

      const noteDocs = purchaseNotes.map((n) => ({
        id: n.id,
        documentType: n.type === 'NCC' ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
        creditDebitNoteId: n.id,
        description: `${n.number} (${n.purchaseOrder?.number || ''})`,
        date: n.createdAt,
        amountUsd: n.totalUsd,
        amountBsHistoric: n.totalBs,
        exchangeRate: n.exchangeRate,
        balanceUsd: this.round2(n.totalUsd - (n.paidAmountUsd || 0)),
        status: 'POSTED',
        sign: n.type === 'NCC' ? -1 : 1, // NCC reduces payable, NDC adds
      })).filter((n) => n.balanceUsd > 0.01);

      // Comprobantes de retencion (IVA + ISLR) emitidos y no aplicados: documentos negativos
      const [ivaVouchers, islrVouchers] = await Promise.all([
        this.prisma.retentionVoucher.findMany({
          where: { supplierId: query.entityId, status: 'ISSUED', appliedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.islrRetentionVoucher.findMany({
          where: { supplierId: query.entityId, status: 'ISSUED', appliedAt: null },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      const retentionDocs = [
        ...ivaVouchers.map((v) => ({
          id: v.id,
          documentType: 'PURCHASE_IVA_RETENTION',
          retentionVoucherId: v.id,
          description: `Ret. IVA ${v.number}`,
          date: v.createdAt,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          exchangeRate: v.exchangeRate,
          balanceUsd: v.retentionAmountUsd,
          status: 'POSTED',
          sign: -1,
        })),
        ...islrVouchers.map((v) => ({
          id: v.id,
          documentType: 'PURCHASE_ISLR_RETENTION',
          islrRetentionVoucherId: v.id,
          description: `Ret. ISLR ${v.number}`,
          date: v.createdAt,
          amountUsd: v.retentionAmountUsd,
          amountBsHistoric: v.retentionAmountBs,
          exchangeRate: v.exchangeRate,
          balanceUsd: v.retentionAmountUsd,
          status: 'POSTED',
          sign: -1,
        })),
      ];

      // Anticipos al proveedor disponibles = créditos que bajan la deuda
      const supplierAdvances = await this.prisma.supplierAdvance.findMany({
        where: { supplierId: query.entityId, status: { in: ['AVAILABLE', 'PARTIAL'] } },
        orderBy: { createdAt: 'asc' },
      });
      const advanceDocs = supplierAdvances.map((a) => ({
        id: a.id,
        documentType: 'SUPPLIER_ADVANCE',
        supplierAdvanceId: a.id,
        description: `Anticipo${a.reference ? ' ' + a.reference : ''} (adelanto)`,
        date: a.createdAt,
        amountUsd: a.amountUsd,
        amountBsHistoric: a.amountBs,
        exchangeRate: a.exchangeRate,
        balanceUsd: this.round2(a.amountUsd - a.paidAmountUsd),
        status: a.status,
        sign: -1,
      }));

      return [...payableDocs, ...noteDocs, ...retentionDocs, ...advanceDocs];
    }

    // Collection mode: by customer or platform
    const receivableWhere: any = {
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    };

    if (query.customerId) {
      receivableWhere.customerId = query.customerId;
    } else if (query.platformName) {
      receivableWhere.type = 'FINANCING_PLATFORM';
      receivableWhere.platformName = query.platformName;
    } else if (query.type === 'COLLECTION' && query.entityId) {
      // Legacy: type=COLLECTION + entityId → customer receivables
      receivableWhere.customerId = query.entityId;
    }

    if (query.search) {
      receivableWhere.OR = [
        { invoice: { number: { contains: query.search, mode: 'insensitive' } } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const receivables = await this.prisma.receivable.findMany({
      where: receivableWhere,
      orderBy: { createdAt: 'asc' },
      include: {
        invoice: { select: { id: true, number: true, createdAt: true } },
      },
    });

    // Fetch sale notes (NCV/NDV) for this customer's invoices
    const customerId = query.customerId || (query.type === 'COLLECTION' ? query.entityId : null);
    let saleNotes: any[] = [];
    if (customerId) {
      const customerInvoices = await this.prisma.invoice.findMany({
        where: { customerId },
        select: { id: true },
      });
      const invoiceIds = customerInvoices.map((inv) => inv.id);

      if (invoiceIds.length > 0) {
        saleNotes = await this.prisma.creditDebitNote.findMany({
          where: {
            invoiceId: { in: invoiceIds },
            type: { in: ['NCV', 'NDV'] },
            status: 'POSTED',
            appliedAt: null,
          },
          include: {
            invoice: { select: { number: true } },
          },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    // Retenciones de IVA sufridas pendientes de cruzar (signo -1)
    let salesRetentions: any[] = [];
    if (customerId) {
      salesRetentions = await this.prisma.customerIvaRetention.findMany({
        where: { customerId, appliedAt: null, cancelledAt: null },
        include: { invoice: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      });
    }

    // Anticipos del cliente (saldo a favor) disponibles = créditos que bajan lo que se cobra
    let customerAdvances: any[] = [];
    if (customerId) {
      customerAdvances = await this.prisma.customerAdvance.findMany({
        where: { customerId, status: { in: ['AVAILABLE', 'PARTIAL'] } },
        orderBy: { createdAt: 'asc' },
      });
    }

    // Excluir receivables que ya estan en un recibo en BORRADOR (evita borradores duplicados)
    const draftReceivableItems = await this.prisma.receiptItem.findMany({
      where: { receivableId: { in: receivables.map((r) => r.id) }, receipt: { status: 'DRAFT' } },
      select: { receivableId: true },
    });
    const draftReceivableIds = new Set(
      draftReceivableItems.map((it) => it.receivableId).filter(Boolean) as string[],
    );
    const visibleReceivables = receivables.filter((r) => !draftReceivableIds.has(r.id));

    return {
      receivables: visibleReceivables.map((r) => ({
        id: r.id,
        type: r.type,
        platformName: r.platformName,
        invoiceNumber: r.invoice?.number || null,
        reference: r.reference,
        amountUsd: r.amountUsd,
        amountBs: r.amountBs,
        paidAmountUsd: r.paidAmountUsd,
        pendingUsd: this.round2(r.amountUsd - r.paidAmountUsd),
        dueDate: r.dueDate,
        createdAt: r.createdAt,
        // Backward compat fields for existing frontend
        documentType: 'CxC',
        receivableId: r.id,
        description: r.invoice?.number || (r as any).documentNumber || `CxC-${r.id.slice(-6)}`,
        date: r.createdAt,
        amountBsHistoric: r.amountBs,
        exchangeRate: r.exchangeRate,
        balanceUsd: this.round2(r.amountUsd - r.paidAmountUsd),
        status: r.status,
      })),
      notes: saleNotes.map((n) => ({
        id: n.id,
        documentType: n.type === 'NCV' ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
        creditDebitNoteId: n.id,
        noteNumber: n.number,
        description: `${n.number} (${n.invoice?.number || ''})`,
        date: n.createdAt,
        amountUsd: n.totalUsd,
        amountBsHistoric: n.totalBs,
        exchangeRate: n.exchangeRate,
        balanceUsd: this.round2(n.totalUsd - (n.paidAmountUsd || 0)),
        status: 'POSTED',
        sign: n.type === 'NCV' ? -1 : 1, // NCV reduces receivable, NDV adds
      })).filter((n) => n.balanceUsd > 0.01),
      retentions: salesRetentions.map((r) => ({
        id: r.id,
        documentType: 'SALES_IVA_RETENTION',
        customerIvaRetentionId: r.id,
        description: `Ret. IVA ${r.number} (${r.invoice?.number || ''})${r.voucherNumber ? ` — Comp. ${r.voucherNumber}` : ''}`,
        date: r.createdAt,
        amountUsd: r.retentionUsd,
        amountBsHistoric: r.retentionBs,
        exchangeRate: r.exchangeRate,
        balanceUsd: r.retentionUsd,
        status: 'POSTED',
        sign: -1,
      })),
      advances: customerAdvances.map((a) => ({
        id: a.id,
        documentType: 'CUSTOMER_ADVANCE',
        customerAdvanceId: a.id,
        description: `Anticipo${a.reference ? ' ' + a.reference : ''} (saldo a favor)`,
        date: a.createdAt,
        amountUsd: a.amountUsd,
        amountBsHistoric: a.amountBs,
        exchangeRate: a.exchangeRate,
        balanceUsd: this.round2(a.amountUsd - a.paidAmountUsd),
        status: a.status,
        sign: -1,
      })),
      payables: [],
    };
  }
}
