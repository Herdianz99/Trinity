import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { QueryNotesDto } from './dto/query-notes.dto';

@Injectable()
export class CreditDebitNotesService {
  constructor(private prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private getIvaRate(ivaType: string): number {
    switch (ivaType) {
      case 'GENERAL':
        return 0.16;
      case 'REDUCED':
        return 0.08;
      case 'SPECIAL':
        return 0.31;
      default:
        return 0;
    }
  }

  async findAll(query: QueryNotesDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.purchaseOrderId) where.purchaseOrderId = query.purchaseOrderId;

    if (query.search) {
      where.number = { contains: query.search, mode: 'insensitive' };
    }

    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) {
        const d = new Date(query.from);
        d.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        d.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.creditDebitNote.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
          purchaseOrder: { select: { id: true, number: true, supplier: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.creditDebitNote.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true, number: true, totalUsd: true, totalBs: true, exchangeRate: true,
            customer: { select: { id: true, name: true, rif: true } },
            cashRegister: { select: { id: true, code: true, name: true } },
          },
        },
        purchaseOrder: {
          select: {
            id: true, number: true, totalUsd: true, totalBs: true, exchangeRate: true,
            supplier: { select: { id: true, name: true, rif: true } },
          },
        },
        items: true,
      },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    return note;
  }

  async create(dto: CreateNoteDto, userId: string) {
    // Validate parent document
    if (['NCV', 'NDV'].includes(dto.type) && !dto.invoiceId) {
      throw new BadRequestException('invoiceId es requerido para notas de venta');
    }
    if (['NCC', 'NDC'].includes(dto.type) && !dto.purchaseOrderId) {
      throw new BadRequestException('purchaseOrderId es requerido para notas de compra');
    }

    // Validate invoice status for sales notes
    if (['NCV', 'NDV'].includes(dto.type) && dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
        select: { status: true },
      });
      if (!invoice) throw new NotFoundException('Factura no encontrada');

      // NCV with MANUAL origin only applies to CREDIT invoices
      if (dto.type === 'NCV' && dto.origin === 'MANUAL' && invoice.status !== 'CREDIT') {
        throw new BadRequestException('Las notas de crédito por ajuste solo aplican a facturas a crédito');
      }
      // NDV only applies to CREDIT invoices
      if (dto.type === 'NDV' && invoice.status !== 'CREDIT') {
        throw new BadRequestException('Las notas de débito solo aplican a facturas a crédito');
      }
    }

    // Get exchange rate for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const rateRecord = await this.prisma.exchangeRate.findFirst({
      where: { date: today },
    });
    if (!rateRecord) throw new BadRequestException('No hay tasa de cambio registrada para hoy');
    const exchangeRate = rateRecord.rate;

    let subtotalUsd = 0;
    let ivaUsd = 0;
    let totalUsd = 0;
    let subtotalBs = 0;
    let ivaBs = 0;
    let totalBs = 0;
    let noteItems: any[] = [];

    if (dto.origin === 'MERCHANDISE') {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException('Debe incluir al menos un item para devolución de mercancía');
      }

      if (['NCV', 'NDV'].includes(dto.type)) {
        // Sales note - fetch invoice items
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: dto.invoiceId },
          include: { items: true },
        });
        if (!invoice) throw new NotFoundException('Factura no encontrada');

        for (const dtoItem of dto.items) {
          const invItem = invoice.items.find((i) => i.id === dtoItem.invoiceItemId);
          if (!invItem) throw new BadRequestException(`Item ${dtoItem.invoiceItemId} no encontrado en factura`);
          if (dtoItem.quantity > invItem.quantity) {
            throw new BadRequestException(`Cantidad excede la original para ${invItem.productName}`);
          }

          const unitPriceUsd = invItem.unitPriceWithoutIva || invItem.unitPrice / (1 + this.getIvaRate(invItem.ivaType));
          const lineSubtotal = this.round2(unitPriceUsd * dtoItem.quantity);
          const lineIva = this.round2(lineSubtotal * this.getIvaRate(invItem.ivaType));
          const lineTotal = this.round2(lineSubtotal + lineIva);

          const unitPriceBs = this.round2(unitPriceUsd * exchangeRate);
          const lineIvaBs = this.round2(lineIva * exchangeRate);
          const lineTotalBs = this.round2(lineTotal * exchangeRate);

          subtotalUsd += lineSubtotal;
          ivaUsd += lineIva;
          totalUsd += lineTotal;
          subtotalBs += this.round2(lineSubtotal * exchangeRate);
          ivaBs += lineIvaBs;
          totalBs += lineTotalBs;

          noteItems.push({
            productId: invItem.productId,
            productName: invItem.productName,
            productCode: invItem.productId,
            quantity: dtoItem.quantity,
            unitPriceUsd: this.round2(unitPriceUsd),
            unitPriceBs,
            ivaType: invItem.ivaType,
            ivaAmount: lineIva,
            ivaAmountBs: lineIvaBs,
            totalUsd: lineTotal,
            totalBs: lineTotalBs,
          });
        }
      } else {
        // Purchase note - fetch PO items
        const po = await this.prisma.purchaseOrder.findUnique({
          where: { id: dto.purchaseOrderId },
          include: { items: { include: { product: true } } },
        });
        if (!po) throw new NotFoundException('Orden de compra no encontrada');

        for (const dtoItem of dto.items) {
          const poItem = po.items.find((i) => i.id === dtoItem.invoiceItemId);
          if (!poItem) throw new BadRequestException(`Item ${dtoItem.invoiceItemId} no encontrado en OC`);
          if (dtoItem.quantity > poItem.receivedQty) {
            throw new BadRequestException(`Cantidad excede la recibida para ${poItem.product.name}`);
          }

          const unitPriceUsd = poItem.costUsd;
          const ivaRate = this.getIvaRate(poItem.product.ivaType);
          const lineSubtotal = this.round2(unitPriceUsd * dtoItem.quantity);
          const lineIva = this.round2(lineSubtotal * ivaRate);
          const lineTotal = this.round2(lineSubtotal + lineIva);

          const unitPriceBs = this.round2(unitPriceUsd * exchangeRate);
          const lineIvaBs = this.round2(lineIva * exchangeRate);
          const lineTotalBs = this.round2(lineTotal * exchangeRate);

          subtotalUsd += lineSubtotal;
          ivaUsd += lineIva;
          totalUsd += lineTotal;
          subtotalBs += this.round2(lineSubtotal * exchangeRate);
          ivaBs += lineIvaBs;
          totalBs += lineTotalBs;

          noteItems.push({
            productId: poItem.productId,
            productName: poItem.product.name,
            productCode: poItem.product.code,
            quantity: dtoItem.quantity,
            unitPriceUsd: this.round2(unitPriceUsd),
            unitPriceBs,
            ivaType: poItem.product.ivaType,
            ivaAmount: lineIva,
            ivaAmountBs: lineIvaBs,
            totalUsd: lineTotal,
            totalBs: lineTotalBs,
          });
        }
      }
    } else {
      // MANUAL origin
      let parentDoc: any = null;
      if (dto.invoiceId) {
        parentDoc = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
        if (!parentDoc) throw new NotFoundException('Factura no encontrada');
      } else if (dto.purchaseOrderId) {
        parentDoc = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });
        if (!parentDoc) throw new NotFoundException('Orden de compra no encontrada');
      }

      if (dto.manualAmountUsd) {
        totalUsd = this.round2(dto.manualAmountUsd);
      } else if (dto.manualPct && parentDoc) {
        totalUsd = this.round2(parentDoc.totalUsd * (dto.manualPct / 100));
      } else {
        throw new BadRequestException('Debe indicar monto manual o porcentaje');
      }

      // Calculate IVA proportionally from parent document
      if (parentDoc) {
        const ivaProportion = parentDoc.ivaUsd
          ? parentDoc.ivaUsd / (parentDoc.subtotalUsd + parentDoc.ivaUsd)
          : 0;
        ivaUsd = this.round2(totalUsd * ivaProportion);
        subtotalUsd = this.round2(totalUsd - ivaUsd);
      } else {
        subtotalUsd = totalUsd;
        ivaUsd = 0;
      }

      subtotalBs = this.round2(subtotalUsd * exchangeRate);
      ivaBs = this.round2(ivaUsd * exchangeRate);
      totalBs = this.round2(totalUsd * exchangeRate);
    }

    // Generate sequential number
    const prefix = dto.type; // NCV, NDV, NCC, NDC
    const lastNote = await this.prisma.creditDebitNote.findFirst({
      where: { type: dto.type as any },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let seq = 1;
    if (lastNote) {
      const parts = lastNote.number.split('-');
      seq = parseInt(parts[1] || '0', 10) + 1;
    }
    const number = `${prefix}-${String(seq).padStart(4, '0')}`;

    const note = await this.prisma.creditDebitNote.create({
      data: {
        number,
        type: dto.type as any,
        origin: dto.origin as any,
        status: 'DRAFT',
        invoiceId: dto.invoiceId || null,
        purchaseOrderId: dto.purchaseOrderId || null,
        cashRegisterId: dto.cashRegisterId || null,
        subtotalUsd: this.round2(subtotalUsd),
        ivaUsd: this.round2(ivaUsd),
        totalUsd: this.round2(totalUsd),
        subtotalBs: this.round2(subtotalBs),
        ivaBs: this.round2(ivaBs),
        totalBs: this.round2(totalBs),
        exchangeRate,
        manualAmountUsd: dto.manualAmountUsd || null,
        manualPct: dto.manualPct || null,
        notes: dto.notes || null,
        createdById: userId,
        items: noteItems.length > 0 ? { create: noteItems } : undefined,
      },
      include: { items: true },
    });

    return note;
  }

  async post(id: string, userId: string) {
    const note = await this.prisma.creditDebitNote.findUnique({
      where: { id },
      include: { items: true, invoice: true, purchaseOrder: true },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.status !== 'DRAFT') throw new BadRequestException('Solo se pueden confirmar notas en borrador');

    // Get default warehouse
    const config = await this.prisma.companyConfig.findFirst();
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { isDefault: true },
    });
    const warehouseId = config?.defaultWarehouseId || defaultWarehouse?.id;

    await this.prisma.$transaction(async (tx) => {
      switch (note.type) {
        case 'NCV': {
          // Nota Crédito Venta: return items to inventory, reduce CxC
          if (note.origin === 'MERCHANDISE' && warehouseId) {
            for (const item of note.items) {
              if (!item.productId) continue;
              await tx.stockMovement.create({
                data: {
                  productId: item.productId,
                  warehouseId,
                  type: 'RETURN_IN',
                  quantity: item.quantity,
                  costUsd: item.unitPriceUsd,
                  reason: `NC Venta ${note.number}`,
                  reference: note.number,
                  createdById: userId,
                },
              });
              await tx.stock.upsert({
                where: { productId_warehouseId: { productId: item.productId, warehouseId } },
                update: { quantity: { increment: item.quantity } },
                create: { productId: item.productId, warehouseId, quantity: item.quantity },
              });
            }
          }
          // Reduce Receivable
          if (note.invoiceId) {
            const receivable = await tx.receivable.findFirst({
              where: { invoiceId: note.invoiceId, status: { in: ['PENDING', 'PARTIAL'] } },
            });
            if (receivable) {
              const newPaidAmount = this.round2(receivable.paidAmountUsd + note.totalUsd);
              const newStatus = newPaidAmount >= receivable.amountUsd ? 'PAID' : 'PARTIAL';
              await tx.receivable.update({
                where: { id: receivable.id },
                data: {
                  paidAmountUsd: newPaidAmount,
                  paidAmountBs: this.round2(newPaidAmount * note.exchangeRate),
                  status: newStatus,
                  paidAt: newStatus === 'PAID' ? new Date() : undefined,
                },
              });
            }
          }
          break;
        }

        case 'NDV': {
          // Nota Débito Venta: create new Receivable
          if (note.invoiceId && note.invoice) {
            await tx.receivable.create({
              data: {
                type: 'CUSTOMER_CREDIT',
                customerId: note.invoice.customerId,
                invoiceId: note.invoiceId,
                amountUsd: note.totalUsd,
                amountBs: note.totalBs,
                exchangeRate: note.exchangeRate,
                status: 'PENDING',
                notes: `Nota Débito ${note.number}`,
              },
            });
          }
          break;
        }

        case 'NCC': {
          // Nota Crédito Compra: remove items from inventory, reduce CxP
          if (note.origin === 'MERCHANDISE' && warehouseId) {
            for (const item of note.items) {
              if (!item.productId) continue;
              await tx.stockMovement.create({
                data: {
                  productId: item.productId,
                  warehouseId,
                  type: 'RETURN_OUT',
                  quantity: item.quantity,
                  costUsd: item.unitPriceUsd,
                  reason: `NC Compra ${note.number}`,
                  reference: note.number,
                  createdById: userId,
                },
              });
              await tx.stock.update({
                where: { productId_warehouseId: { productId: item.productId, warehouseId } },
                data: { quantity: { decrement: item.quantity } },
              });
            }
          }
          // Reduce Payable
          if (note.purchaseOrderId) {
            const payable = await tx.payable.findFirst({
              where: { purchaseOrderId: note.purchaseOrderId, status: { in: ['PENDING', 'PARTIAL'] } },
            });
            if (payable) {
              const newPaidAmount = this.round2(payable.paidAmountUsd + note.totalUsd);
              const newStatus = newPaidAmount >= payable.netPayableUsd ? 'PAID' : 'PARTIAL';
              await tx.payable.update({
                where: { id: payable.id },
                data: {
                  paidAmountUsd: newPaidAmount,
                  paidAmountBs: this.round2(newPaidAmount * note.exchangeRate),
                  status: newStatus,
                  paidAt: newStatus === 'PAID' ? new Date() : undefined,
                },
              });
            }
          }
          break;
        }

        case 'NDC': {
          // Nota Débito Compra: create new Payable
          if (note.purchaseOrderId && note.purchaseOrder) {
            await tx.payable.create({
              data: {
                supplierId: note.purchaseOrder.supplierId,
                purchaseOrderId: note.purchaseOrderId,
                amountUsd: note.totalUsd,
                amountBs: note.totalBs,
                exchangeRate: note.exchangeRate,
                retentionUsd: 0,
                retentionBs: 0,
                netPayableUsd: note.totalUsd,
                netPayableBs: note.totalBs,
                status: 'PENDING',
                notes: `Nota Débito ${note.number}`,
              },
            });
          }
          break;
        }
      }

      // Update note status
      await tx.creditDebitNote.update({
        where: { id },
        data: { status: 'POSTED' },
      });
    });

    return this.findOne(id);
  }

  async cancel(id: string) {
    const note = await this.prisma.creditDebitNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.status !== 'DRAFT') throw new BadRequestException('Solo se pueden cancelar notas en borrador');

    await this.prisma.creditDebitNote.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Nota cancelada' };
  }
}
