import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { UpdateDispatchDto } from './dto/update-dispatch.dto';
import { DeliverDispatchDto } from './dto/deliver-dispatch.dto';

const EPS = 0.001;
function round2(n: number) { return Math.round(n * 100) / 100; }

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateNumber(tx: any): Promise<string> {
    const last = await tx.dispatch.findFirst({
      where: { number: { startsWith: 'DSP-' } },
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let next = 1;
    if (last) {
      const n = parseInt(last.number.split('-')[1], 10);
      if (!isNaN(n)) next = n + 1;
    }
    return `DSP-${String(next).padStart(4, '0')}`;
  }

  // Estado derivado de las cantidades despachadas de los items.
  private computeStatus(items: { quantityInvoiced: number; quantityDelivered: number }[]): 'PENDIENTE' | 'PARCIAL' | 'COMPLETADO' {
    const allDone = items.every((i) => i.quantityDelivered >= i.quantityInvoiced - EPS);
    if (allDone) return 'COMPLETADO';
    const some = items.some((i) => i.quantityDelivered > EPS);
    return some ? 'PARCIAL' : 'PENDIENTE';
  }

  async create(dto: CreateDispatchDto, userId: string) {
    const num = dto.invoiceNumber.trim();
    const invoice = await this.prisma.invoice.findUnique({
      where: { number: num },
      include: { items: true, customer: true, dispatch: true },
    });
    if (!invoice) throw new NotFoundException(`No existe una factura con el número "${num}"`);
    if (!['PAID', 'PARTIAL_RETURN'].includes(invoice.status)) {
      throw new BadRequestException('La factura no está pagada; solo se despacha mercancía ya pagada');
    }
    if (invoice.dispatch) {
      throw new BadRequestException(`Esta factura ya tiene una comanda de retiro (${invoice.dispatch.number})`);
    }

    // Datos de producto (servicio se excluye; no se despacha) + zona por categoría
    const productIds = [...new Set(invoice.items.map((i) => i.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { category: { include: { printArea: true } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const needFallback = invoice.items.some((i) => {
      const p = productMap.get(i.productId);
      return p && !p.isService && !p.category?.printAreaId;
    });
    let fallbackArea: { id: string; name: string } | null = null;
    if (needFallback) {
      const def = await this.prisma.printArea.findFirst({ where: { isDefault: true }, select: { id: true, name: true } })
        ?? await this.prisma.printArea.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } });
      fallbackArea = def || null;
    }

    const itemsData = invoice.items
      .filter((it) => !productMap.get(it.productId)?.isService)
      .map((it) => {
        const p = productMap.get(it.productId);
        const area = p?.category?.printArea
          ? { id: p.category.printArea.id, name: p.category.printArea.name }
          : fallbackArea;
        return {
          productId: it.productId,
          productName: it.productName,
          productCode: p?.code || null,
          printAreaId: area?.id || null,
          printAreaName: area?.name || null,
          quantityInvoiced: it.quantity,
          quantityDelivered: 0,
        };
      });

    if (itemsData.length === 0) {
      throw new BadRequestException('La factura no tiene artículos despachables (solo servicios)');
    }

    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.dispatch.create({
        data: {
          number,
          invoiceId: invoice.id,
          status: 'PENDIENTE',
          contactName: invoice.customer?.name || null,
          contactPhone: invoice.customer?.phone || null,
          createdById: userId,
          items: { create: itemsData },
        },
        include: this.detailInclude(),
      });
    });
  }

  private detailInclude() {
    return {
      items: true,
      deliveries: {
        include: { deliveredBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
      invoice: {
        select: {
          id: true, number: true, totalUsd: true, paidAt: true,
          customer: { select: { id: true, name: true, documentType: true, rif: true, phone: true } },
          seller: { select: { id: true, name: true } },
        },
      },
    };
  }

  async findAll(filters: { status?: string; search?: string }) {
    const where: any = {};
    // 'PENDIENTES' = comandas con mercancia aun por retirar (PENDIENTE + PARCIAL); es el
    // filtro por defecto del front. Ausente o 'TODAS' = sin filtro. Otro valor = estado exacto.
    if (filters.status && filters.status !== 'TODAS') {
      where.status = filters.status === 'PENDIENTES'
        ? { in: ['PENDIENTE', 'PARCIAL'] }
        : filters.status;
    }
    const s = filters.search?.trim();
    if (s) {
      const digits = s.replace(/\D/g, '');
      where.OR = [
        { number: { contains: s, mode: 'insensitive' } },
        { contactName: { contains: s, mode: 'insensitive' } },
        { contactPhone: { contains: s, mode: 'insensitive' } },
        { invoice: { number: { contains: s, mode: 'insensitive' } } },
        { invoice: { customer: { name: { contains: s, mode: 'insensitive' } } } },
        ...(digits.length >= 3 ? [{ invoice: { customer: { rif: { contains: digits } } } }] : []),
      ];
    }
    return this.prisma.dispatch.findMany({
      where,
      include: this.detailInclude(),
      orderBy: [{ status: 'asc' }, { scheduledDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  // Vista por ARTÍCULOS de una zona (tabs). Devuelve los items pendientes (falta por
  // despachar) de comandas activas, con datos de su comanda/cliente. Sin printAreaId = todas.
  async getItems(filters: { printAreaId?: string; search?: string }) {
    const dispatches = await this.prisma.dispatch.findMany({
      where: { status: { in: ['PENDIENTE', 'PARCIAL'] } },
      include: this.detailInclude(),
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'desc' }],
    });
    const s = filters.search?.trim().toLowerCase();
    const digits = (filters.search || '').replace(/\D/g, '');
    const rows: any[] = [];
    for (const d of dispatches) {
      if (s) {
        const hay = [
          d.number, d.contactName, d.contactPhone,
          (d as any).invoice?.number, (d as any).invoice?.customer?.name,
        ].filter(Boolean).some((v: string) => v.toLowerCase().includes(s));
        const rifHit = digits.length >= 3 && ((d as any).invoice?.customer?.rif || '').replace(/\D/g, '').includes(digits);
        if (!hay && !rifHit) continue;
      }
      for (const it of (d as any).items) {
        if (filters.printAreaId && it.printAreaId !== filters.printAreaId) continue;
        const pending = round2(it.quantityInvoiced - it.quantityDelivered);
        if (pending <= EPS) continue;
        rows.push({
          dispatchItemId: it.id,
          dispatchId: d.id,
          dispatchNumber: d.number,
          status: d.status,
          scheduledDate: d.scheduledDate,
          contactName: d.contactName,
          contactPhone: d.contactPhone,
          invoiceNumber: (d as any).invoice?.number,
          customerName: (d as any).invoice?.customer?.name,
          productCode: it.productCode,
          productName: it.productName,
          printAreaId: it.printAreaId,
          printAreaName: it.printAreaName,
          quantityInvoiced: it.quantityInvoiced,
          quantityDelivered: it.quantityDelivered,
          quantityPending: pending,
        });
      }
    }
    return rows;
  }

  async findOne(id: string) {
    const d = await this.prisma.dispatch.findUnique({ where: { id }, include: this.detailInclude() });
    if (!d) throw new NotFoundException('Comanda de retiro no encontrada');
    return d;
  }

  async update(id: string, dto: UpdateDispatchDto) {
    const exists = await this.prisma.dispatch.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Comanda de retiro no encontrada');
    const data: any = {};
    if (dto.scheduledDate !== undefined) data.scheduledDate = dto.scheduledDate ? new Date(dto.scheduledDate) : null;
    if (dto.contactName !== undefined) data.contactName = dto.contactName || null;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    return this.prisma.dispatch.update({ where: { id }, data, include: this.detailInclude() });
  }

  async deliver(id: string, dto: DeliverDispatchDto, userId: string) {
    if (!dto.lines?.length) throw new BadRequestException('Debe indicar al menos una cantidad a despachar');

    return this.prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.findUnique({ where: { id }, include: { items: true } });
      if (!dispatch) throw new NotFoundException('Comanda de retiro no encontrada');
      if (dispatch.status === 'CANCELADO') throw new BadRequestException('La comanda está cancelada');
      if (dispatch.status === 'COMPLETADO') throw new BadRequestException('La comanda ya está completada');

      const itemMap = new Map(dispatch.items.map((i) => [i.id, i]));
      const snapshotLines: { dispatchItemId: string; productName: string; qty: number }[] = [];

      for (const line of dto.lines) {
        const item = itemMap.get(line.dispatchItemId);
        if (!item) throw new BadRequestException('Un artículo no pertenece a esta comanda');
        const qty = round2(line.qty);
        if (qty <= 0) continue;
        const newDelivered = round2(item.quantityDelivered + qty);
        if (newDelivered > item.quantityInvoiced + EPS) {
          throw new BadRequestException(
            `"${item.productName}": no puede despachar ${qty} (facturado ${item.quantityInvoiced}, ya despachado ${item.quantityDelivered})`,
          );
        }
        await tx.dispatchItem.update({ where: { id: item.id }, data: { quantityDelivered: newDelivered } });
        item.quantityDelivered = newDelivered; // reflejar para recomputar estado
        snapshotLines.push({ dispatchItemId: item.id, productName: item.productName, qty });
      }

      if (snapshotLines.length === 0) throw new BadRequestException('No hay cantidades válidas para despachar');

      await tx.dispatchDelivery.create({
        data: {
          dispatchId: id,
          deliveredById: userId,
          note: dto.note || null,
          lines: snapshotLines,
        },
      });

      const status = this.computeStatus(dispatch.items);
      await tx.dispatch.update({
        where: { id },
        data: { status, completedAt: status === 'COMPLETADO' ? new Date() : null },
      });

      return tx.dispatch.findUnique({ where: { id }, include: this.detailInclude() });
    });
  }

  async cancel(id: string) {
    const d = await this.prisma.dispatch.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!d) throw new NotFoundException('Comanda de retiro no encontrada');
    if (d.status === 'COMPLETADO') throw new BadRequestException('No se puede cancelar una comanda completada');
    return this.prisma.dispatch.update({ where: { id }, data: { status: 'CANCELADO' }, include: this.detailInclude() });
  }
}
