import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDayStart, caracasDayEnd } from '../../common/timezone';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    productId?: string;
    warehouseId?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    if (filters.productId) {
      where.productId = filters.productId;
    }

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        where.createdAt.gte = caracasDayStart(filters.from);
      }
      if (filters.to) {
        where.createdAt.lte = caracasDayEnd(filters.to);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: filters.productId ? 'asc' : 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    // Enriquecer movimientos de venta con el precio de venta y descuento de la
    // linea de factura origen (para auditar descuentos de cajeros). El movimiento
    // SALE no guarda precio; lo buscamos en InvoiceItem por (invoiceId, productId).
    const saleInvoiceIds = [
      ...new Set(
        data
          .filter((m) => m.sourceType === 'SALE_INVOICE' && m.sourceId)
          .map((m) => m.sourceId as string),
      ),
    ];

    const itemsByKey = new Map<string, { quantity: number; totalUsd: number; discountPct: number }>();
    if (saleInvoiceIds.length) {
      const items = await this.prisma.invoiceItem.findMany({
        where: { invoiceId: { in: saleInvoiceIds } },
        select: { invoiceId: true, productId: true, quantity: true, totalUsd: true, discountPct: true },
      });
      for (const it of items) {
        itemsByKey.set(`${it.invoiceId}|${it.productId}`, {
          quantity: it.quantity,
          totalUsd: it.totalUsd,
          discountPct: it.discountPct,
        });
      }
    }

    const enriched = data.map((m) => {
      if (m.sourceType === 'SALE_INVOICE' && m.sourceId) {
        const it = itemsByKey.get(`${m.sourceId}|${m.productId}`);
        if (it && it.quantity > 0) {
          // Precio unitario final que paga el cliente: con IVA incluido y descuento
          // ya aplicado. totalUsd = subtotal-con-descuento + IVA de la linea.
          const grossUnitPrice = Math.round((it.totalUsd / it.quantity) * 100) / 100;
          return { ...m, salePrice: grossUnitPrice, discountPct: it.discountPct };
        }
      }
      return { ...m, salePrice: null, discountPct: null };
    });

    return {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Kardex: returns ALL movements for a product ordered ASC with computed running balance.
   * Groups all warehouses into a single running total.
   */
  async getKardex(productId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.prisma.stockMovement.count({
      where: { productId },
    });

    // Total balance = sum of ALL movements for this product
    const totalAgg = await this.prisma.stockMovement.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const totalBalance = totalAgg._sum.quantity || 0;

    // Sum of skipped (more recent) movements for pagination
    let sumOfSkipped = 0;
    if (skip > 0) {
      const skipped = await this.prisma.stockMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: skip,
        select: { quantity: true },
      });
      sumOfSkipped = skipped.reduce((sum, m) => sum + m.quantity, 0);
    }

    // Fetch the page's movements (newest first)
    const movements = await this.prisma.stockMovement.findMany({
      where: { productId },
      include: {
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // ── Enriquecer cada movimiento con la contraparte (cliente/proveedor) y el
    //    responsable segun el documento origen: factura de venta -> cliente + vendedor;
    //    compra -> proveedor + quien la cargo; NC/ND -> cliente o proveedor + su creador;
    //    ajustes/conteos/transferencias/reemplazos -> usuario que hizo el movimiento. ──
    const idsBySource = (t: string) => [
      ...new Set(movements.filter((m) => m.sourceType === t && m.sourceId).map((m) => m.sourceId as string)),
    ];
    const saleIds = idsBySource('SALE_INVOICE');
    const poIds = idsBySource('PURCHASE_ORDER');
    const noteIds = idsBySource('CREDIT_DEBIT_NOTE');

    const [invoices, purchaseOrders, notes] = await Promise.all([
      saleIds.length
        ? this.prisma.invoice.findMany({
            where: { id: { in: saleIds } },
            select: { id: true, createdById: true, customer: { select: { name: true } }, seller: { select: { name: true } } },
          })
        : Promise.resolve([]),
      poIds.length
        ? this.prisma.purchaseOrder.findMany({
            where: { id: { in: poIds } },
            select: { id: true, createdById: true, supplier: { select: { name: true } } },
          })
        : Promise.resolve([]),
      noteIds.length
        ? this.prisma.creditDebitNote.findMany({
            where: { id: { in: noteIds } },
            select: {
              id: true,
              createdById: true,
              invoice: { select: { customer: { select: { name: true } } } },
              purchaseOrder: { select: { supplier: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
    ]);

    const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
    const poMap = new Map(purchaseOrders.map((p) => [p.id, p]));
    const noteMap = new Map(notes.map((n) => [n.id, n]));

    // Usuarios a resolver por nombre: compras/notas + movimientos sin contraparte + facturas sin vendedor.
    const userIds = new Set<string>();
    for (const m of movements) {
      if (m.sourceType === 'PURCHASE_ORDER' && m.sourceId) {
        const po = poMap.get(m.sourceId);
        if (po) userIds.add(po.createdById);
      } else if (m.sourceType === 'CREDIT_DEBIT_NOTE' && m.sourceId) {
        const n = noteMap.get(m.sourceId);
        if (n) userIds.add(n.createdById);
      } else if (m.sourceType === 'SALE_INVOICE' && m.sourceId) {
        const inv = invoiceMap.get(m.sourceId);
        if (inv && !inv.seller) userIds.add(inv.createdById);
      } else {
        userIds.add(m.createdById);
      }
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    // Compute running balance for each row (descending order)
    let runningBalance = totalBalance - sumOfSkipped;
    const data = movements.map((m) => {
      const stockAfter = runningBalance;
      runningBalance -= m.quantity;

      let party: string | null = null;
      let creator: string | null = null;
      if (m.sourceType === 'SALE_INVOICE' && m.sourceId) {
        const inv = invoiceMap.get(m.sourceId);
        party = inv?.customer?.name ?? null;
        creator = inv?.seller?.name ?? (inv ? userMap.get(inv.createdById) ?? null : null);
      } else if (m.sourceType === 'PURCHASE_ORDER' && m.sourceId) {
        const po = poMap.get(m.sourceId);
        party = po?.supplier?.name ?? null;
        creator = po ? userMap.get(po.createdById) ?? null : null;
      } else if (m.sourceType === 'CREDIT_DEBIT_NOTE' && m.sourceId) {
        const n = noteMap.get(m.sourceId);
        party = n?.invoice?.customer?.name ?? n?.purchaseOrder?.supplier?.name ?? null;
        creator = n ? userMap.get(n.createdById) ?? null : null;
      } else {
        creator = userMap.get(m.createdById) ?? null;
      }

      return {
        ...m,
        stockAfter,
        party,
        creator,
      };
    });

    // Compute totals for this page
    const totalEntries = movements
      .filter((m) => m.quantity > 0)
      .reduce((s, m) => s + m.quantity, 0);
    const totalExits = movements
      .filter((m) => m.quantity < 0)
      .reduce((s, m) => s + Math.abs(m.quantity), 0);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        balanceBefore: totalBalance - sumOfSkipped,
        totalEntries,
        totalExits,
      },
    };
  }
}
