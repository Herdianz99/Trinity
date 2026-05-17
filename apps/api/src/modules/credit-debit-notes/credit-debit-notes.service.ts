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
            id: true, number: true, fiscalNumber: true, fiscalMachineSerial: true, createdAt: true,
            totalUsd: true, totalBs: true, exchangeRate: true, igtfUsd: true,
            customer: { select: { id: true, name: true, rif: true, documentType: true, address: true, phone: true } },
            cashRegister: { select: { id: true, code: true, name: true, isFiscal: true, comPort: true } },
            payments: { select: { amountUsd: true, amountBs: true, method: { select: { fiscalCode: true } } } },
          },
        },
        cashRegister: {
          select: { id: true, code: true, name: true, isFiscal: true, comPort: true },
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
        select: { status: true, paymentType: true },
      });
      if (!invoice) throw new NotFoundException('Factura no encontrada');

      // Fully returned invoices cannot have more notes
      if (invoice.status === 'RETURNED') {
        throw new BadRequestException('La factura ya fue devuelta completamente');
      }
      // NCV with MANUAL origin only applies to CREDIT invoices
      if (dto.type === 'NCV' && dto.origin === 'MANUAL' && invoice.paymentType !== 'CREDIT') {
        throw new BadRequestException('Las notas de crédito por ajuste solo aplican a facturas a crédito');
      }
      // NDV only applies to CREDIT invoices
      if (dto.type === 'NDV' && invoice.paymentType !== 'CREDIT') {
        throw new BadRequestException('Las notas de débito solo aplican a facturas a crédito');
      }
      // NCV MERCHANDISE: allows PAID or PARTIAL_RETURN
      if (dto.type === 'NCV' && dto.origin === 'MERCHANDISE') {
        if (!['PAID', 'PARTIAL_RETURN'].includes(invoice.status)) {
          throw new BadRequestException('Solo se pueden devolver facturas procesadas');
        }
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
    let igtfUsd = 0;
    let igtfBs = 0;
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

        // Fetch product codes for all items
        const productIds = invoice.items.map((i) => i.productId);
        const products = await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, code: true },
        });
        const productCodeMap = new Map(products.map((p) => [p.id, p.code]));

        // IGTF invoices require full return — all items at full quantities
        if (invoice.igtfUsd > 0) {
          const dtoItemMap = new Map(dto.items.map((i) => [i.invoiceItemId, i.quantity]));
          for (const invItem of invoice.items) {
            const dtoQty = dtoItemMap.get(invItem.id);
            if (dtoQty === undefined || dtoQty < invItem.quantity) {
              throw new BadRequestException(
                'Esta factura tiene IGTF. La devolución debe ser completa — se deben incluir todos los productos en sus cantidades originales',
              );
            }
          }
        }

        for (const dtoItem of dto.items) {
          const invItem = invoice.items.find((i) => i.id === dtoItem.invoiceItemId);
          if (!invItem) throw new BadRequestException(`Item ${dtoItem.invoiceItemId} no encontrado en factura`);

          // Check already returned quantities from previous POSTED notes
          const alreadyReturned = await this.prisma.creditDebitNoteItem.aggregate({
            where: {
              note: {
                invoiceId: dto.invoiceId,
                type: 'NCV',
                status: 'POSTED',
                origin: 'MERCHANDISE',
              },
              productId: invItem.productId,
            },
            _sum: { quantity: true },
          });
          const returnedQty = alreadyReturned._sum.quantity || 0;
          const availableQty = invItem.quantity - returnedQty;

          if (availableQty <= 0) {
            throw new BadRequestException(`El producto '${invItem.productName}' ya fue devuelto completamente`);
          }
          if (dtoItem.quantity > availableQty) {
            throw new BadRequestException(`Solo puedes devolver ${availableQty} unidades de '${invItem.productName}'. Ya se devolvieron ${returnedQty}`);
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
            productCode: productCodeMap.get(invItem.productId) || '',
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

          // Check already returned quantities from previous POSTED notes
          const alreadyReturned = await this.prisma.creditDebitNoteItem.aggregate({
            where: {
              note: {
                purchaseOrderId: dto.purchaseOrderId,
                type: 'NCC',
                status: 'POSTED',
                origin: 'MERCHANDISE',
              },
              productId: poItem.productId,
            },
            _sum: { quantity: true },
          });
          const returnedQty = alreadyReturned._sum.quantity || 0;
          const availableQty = poItem.receivedQty - returnedQty;

          if (availableQty <= 0) {
            throw new BadRequestException(`El producto '${poItem.product.name}' ya fue devuelto completamente`);
          }
          if (dtoItem.quantity > availableQty) {
            throw new BadRequestException(`Solo puedes devolver ${availableQty} unidades de '${poItem.product.name}'. Ya se devolvieron ${returnedQty}`);
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

    // IGTF: copy from invoice when it's a full merchandise return with IGTF
    if (dto.origin === 'MERCHANDISE' && ['NCV', 'NDV'].includes(dto.type) && dto.invoiceId) {
      const invForIgtf = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
        select: { igtfUsd: true, igtfBs: true },
      });
      if (invForIgtf && invForIgtf.igtfUsd > 0) {
        igtfUsd = this.round2(invForIgtf.igtfUsd);
        igtfBs = this.round2(invForIgtf.igtfBs);
        totalUsd = this.round2(totalUsd + igtfUsd);
        totalBs = this.round2(totalBs + igtfBs);
      }
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
        igtfUsd: this.round2(igtfUsd),
        igtfBs: this.round2(igtfBs),
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
      include: { items: true },
    });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.status !== 'DRAFT') throw new BadRequestException('Solo se pueden confirmar notas en borrador');

    // Get default warehouse for inventory movements
    const config = await this.prisma.companyConfig.findFirst();
    const defaultWarehouse = await this.prisma.warehouse.findFirst({
      where: { isDefault: true },
    });
    const warehouseId = config?.defaultWarehouseId || defaultWarehouse?.id;

    await this.prisma.$transaction(async (tx) => {
      // NCV with MERCHANDISE: return items to inventory
      if (note.type === 'NCV' && note.origin === 'MERCHANDISE' && warehouseId) {
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

        // Update invoice status: RETURNED or PARTIAL_RETURN
        if (note.invoiceId) {
          const invoice = await tx.invoice.findUnique({
            where: { id: note.invoiceId },
            include: { items: true },
          });
          if (invoice) {
            const allPostedNotes = await tx.creditDebitNote.findMany({
              where: { invoiceId: note.invoiceId, type: 'NCV', origin: 'MERCHANDISE', status: 'POSTED' },
              include: { items: true },
            });
            const totalReturnedByProduct: Record<string, number> = {};
            for (const n of allPostedNotes) {
              for (const item of n.items) {
                if (item.productId) {
                  totalReturnedByProduct[item.productId] = (totalReturnedByProduct[item.productId] || 0) + item.quantity;
                }
              }
            }
            // Add current note items (not yet POSTED at this point)
            for (const item of note.items) {
              if (item.productId) {
                totalReturnedByProduct[item.productId] = (totalReturnedByProduct[item.productId] || 0) + item.quantity;
              }
            }
            const allReturned = invoice.items.every(
              (invItem) => (totalReturnedByProduct[invItem.productId] || 0) >= invItem.quantity
            );
            await tx.invoice.update({
              where: { id: note.invoiceId },
              data: { status: allReturned ? 'RETURNED' : 'PARTIAL_RETURN' },
            });
          }
        }
      }

      // NCC with MERCHANDISE: remove items from inventory
      if (note.type === 'NCC' && note.origin === 'MERCHANDISE' && warehouseId) {
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

      // Update note status to POSTED (no CxC/CxP effects — applied via receipts)
      await tx.creditDebitNote.update({
        where: { id },
        data: { status: 'POSTED' },
      });
    });

    return this.findOne(id);
  }

  async getInvoiceReturnSummary(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const returnedItems = await this.prisma.creditDebitNoteItem.groupBy({
      by: ['productId'],
      where: {
        note: {
          invoiceId,
          type: 'NCV',
          status: 'POSTED',
          origin: 'MERCHANDISE',
        },
      },
      _sum: { quantity: true },
    });
    const returnedMap = new Map(
      returnedItems.map((r) => [r.productId, r._sum.quantity || 0]),
    );

    return invoice.items.map((item) => {
      const returnedQty = returnedMap.get(item.productId) || 0;
      return {
        itemId: item.id,
        productId: item.productId,
        productName: item.productName,
        originalQty: item.quantity,
        returnedQty,
        availableQty: Math.max(0, item.quantity - returnedQty),
      };
    });
  }

  async getPurchaseReturnSummary(purchaseOrderId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: { include: { product: true } } },
    });
    if (!po) throw new NotFoundException('Orden de compra no encontrada');

    const returnedItems = await this.prisma.creditDebitNoteItem.groupBy({
      by: ['productId'],
      where: {
        note: {
          purchaseOrderId,
          type: 'NCC',
          status: 'POSTED',
          origin: 'MERCHANDISE',
        },
      },
      _sum: { quantity: true },
    });
    const returnedMap = new Map(
      returnedItems.map((r) => [r.productId, r._sum.quantity || 0]),
    );

    return po.items.map((item) => {
      const returnedQty = returnedMap.get(item.productId) || 0;
      return {
        itemId: item.id,
        productId: item.productId,
        productName: item.product.name,
        originalQty: item.receivedQty,
        returnedQty,
        availableQty: Math.max(0, item.receivedQty - returnedQty),
      };
    });
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

  async markFiscalPrinted(
    id: string,
    body?: { fiscalNumber?: string; machineSerial?: string },
  ) {
    const note = await this.prisma.creditDebitNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    if (note.fiscalPrinted) throw new BadRequestException('Esta nota ya fue impresa fiscalmente');

    await this.prisma.creditDebitNote.update({
      where: { id },
      data: {
        fiscalPrinted: true,
        ...(body?.fiscalNumber && { fiscalNumber: body.fiscalNumber }),
        ...(body?.machineSerial && { machineSerial: body.machineSerial }),
      },
    });

    return { message: 'Nota marcada como impresa fiscalmente' };
  }
}
