import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { PostReceiptDto } from './dto/post-receipt.dto';
import { QueryReceiptsDto } from './dto/query-receipts.dto';
import { QueryPendingDocumentsDto } from './dto/query-pending-documents.dto';

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

    // Get today's exchange rate
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException('No hay tasa de cambio registrada para hoy. Registre la tasa antes de crear el recibo.');
    }

    // Build items
    const items: Array<{
      itemType: 'RECEIVABLE' | 'PAYABLE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
      receivableId?: string;
      payableId?: string;
      creditDebitNoteId?: string;
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
        if (receivable.status === 'PAID') throw new BadRequestException(`CxC ${receivable.invoice?.number || item.receivableId} ya está pagada`);

        const balanceUsd = this.round2(receivable.amountUsd - receivable.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        // Historic Bs: proportional to the original Bs amount
        const proportion = amountUsd / receivable.amountUsd;
        const amountBsHistoric = this.round2(receivable.amountBs * proportion);
        const amountBsToday = this.round2(amountUsd * rate.rate);

        items.push({
          itemType: 'RECEIVABLE',
          receivableId: item.receivableId,
          description: receivable.invoice?.number || `CxC-${item.receivableId.slice(-6)}`,
          amountUsd,
          amountBsHistoric,
          amountBsToday,
          differentialBs: 0,
          sign: item.sign,
        });
      } else if (item.payableId) {
        const payable = await this.prisma.payable.findUnique({
          where: { id: item.payableId },
          include: { purchaseOrder: { select: { number: true } } },
        });
        if (!payable) throw new BadRequestException(`CxP ${item.payableId} no encontrada`);
        if (payable.status === 'PAID') throw new BadRequestException(`CxP ${payable.purchaseOrder?.number || item.payableId} ya está pagada`);

        const balanceUsd = this.round2(payable.netPayableUsd - payable.paidAmountUsd);
        const amountUsd = item.amountUsd ? Math.min(item.amountUsd, balanceUsd) : balanceUsd;
        const proportion = amountUsd / payable.netPayableUsd;
        const amountBsHistoric = this.round2(payable.netPayableBs * proportion);
        const amountBsToday = this.round2(amountUsd * rate.rate);

        items.push({
          itemType: 'PAYABLE',
          payableId: item.payableId,
          description: payable.purchaseOrder?.number || `CxP-${item.payableId.slice(-6)}`,
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
        const amountUsd = note.totalUsd;
        const amountBsHistoric = note.totalBs;
        const amountBsToday = this.round2(amountUsd * rate.rate);

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
          exchangeRate: rate.rate,
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

    // Get today's rate for payment records
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: today } });
    if (!rate) {
      throw new BadRequestException('No hay tasa de cambio registrada para hoy');
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
          const receivable = item.receivable;
          const payAmount = item.amountUsd;
          const amountBs = this.round2(payAmount * rate.rate);
          const newPaidUsd = this.round2(receivable.paidAmountUsd + payAmount);
          const newPaidBs = this.round2(receivable.paidAmountBs + amountBs);
          const isPaid = newPaidUsd >= receivable.amountUsd - 0.01;

          await tx.receivablePayment.create({
            data: {
              receivableId: item.receivableId,
              amountUsd: payAmount,
              amountBs,
              exchangeRate: rate.rate,
              methodId: dto.payments[0]?.methodId, // use first payment method as reference
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
          const payable = item.payable;
          const payAmount = item.amountUsd;
          const amountBs = this.round2(payAmount * rate.rate);
          const newPaidUsd = this.round2(payable.paidAmountUsd + payAmount);
          const newPaidBs = this.round2(payable.paidAmountBs + amountBs);
          const isPaid = newPaidUsd >= payable.netPayableUsd - 0.01;

          await tx.payablePayment.create({
            data: {
              payableId: item.payableId,
              amountUsd: payAmount,
              amountBs,
              exchangeRate: rate.rate,
              methodId: dto.payments[0]?.methodId,
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
          // Mark note as applied
          await tx.creditDebitNote.update({
            where: { id: item.creditDebitNoteId },
            data: { appliedAt: new Date() },
          });
        }
        // DIFFERENTIAL items don't generate CxC/CxP movements
      }

      // Create payment records on the receipt
      for (const payment of dto.payments) {
        await tx.receiptPayment.create({
          data: {
            receiptId: receipt.id,
            methodId: payment.methodId,
            amountUsd: payment.amountUsd,
            amountBs: payment.amountBs,
            exchangeRate: rate.rate,
            reference: payment.reference || null,
          },
        });
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

  async getPendingDocuments(query: QueryPendingDocumentsDto) {
    // Legacy support: type=PAYMENT + entityId → flat array of payables + notes
    if (query.type === 'PAYMENT' && query.entityId) {
      const where: any = {
        supplierId: query.entityId,
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      };

      if (query.search) {
        where.purchaseOrder = {
          number: { contains: query.search, mode: 'insensitive' },
        };
      }

      const payables = await this.prisma.payable.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          purchaseOrder: { select: { id: true, number: true, createdAt: true } },
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

      const payableDocs = payables.map((p) => ({
        id: p.id,
        documentType: 'CxP',
        payableId: p.id,
        description: p.purchaseOrder?.number || `CxP-${p.id.slice(-6)}`,
        date: p.createdAt,
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
        balanceUsd: n.totalUsd,
        status: 'POSTED',
        sign: n.type === 'NCC' ? -1 : 1, // NCC reduces payable, NDC adds
      }));

      return [...payableDocs, ...noteDocs];
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

    return {
      receivables: receivables.map((r) => ({
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
        description: r.invoice?.number || `CxC-${r.id.slice(-6)}`,
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
        amountBs: n.totalBs,
        exchangeRate: n.exchangeRate,
        balanceUsd: n.totalUsd,
        status: 'POSTED',
        sign: n.type === 'NCV' ? -1 : 1, // NCV reduces receivable, NDV adds
      })),
      payables: [],
    };
  }
}
