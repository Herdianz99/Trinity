import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isLockActive } from '../invoices/invoices.service';

// "Sin ver" = nunca visto por la empresa, o el cliente lo modifico despues de la ultima vista.
const isUnseen = (r: { staffSeenAt: Date | null; clientUpdatedAt: Date | null }) =>
  !r.staffSeenAt || (!!r.clientUpdatedAt && r.clientUpdatedAt > r.staffSeenAt);

@Injectable()
export class ClientOrdersService {
  constructor(private prisma: PrismaService) {}

  private async sellerOf(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId }, select: { id: true } });
    return seller?.id ?? null;
  }

  async list(q: { sellerId?: string; mine?: boolean }, userId: string) {
    let sellerId = q.sellerId || undefined;
    // "Mis clientes": pedidos del vendedor vinculado al usuario (ninguno si no tiene vendedor).
    if (q.mine) sellerId = (await this.sellerOf(userId)) ?? '__none__';

    const rows = await this.prisma.invoice.findMany({
      where: { fromPortal: true, status: 'PENDING', ...(sellerId ? { sellerId } : {}) },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true, staffSeenAt: true,
        totalUsd: true, totalBs: true, lockedById: true, lockedAt: true,
        customer: { select: { id: true, name: true, code: true } },
        seller: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { clientUpdatedAt: 'desc' },
    });

    const lockerIds = rows.filter((r) => isLockActive(r.lockedById, r.lockedAt)).map((r) => r.lockedById!);
    const lockers = lockerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: lockerIds } }, select: { id: true, name: true } })
      : [];
    const lockerMap = new Map(lockers.map((u) => [u.id, u.name]));

    return rows.map(({ _count, lockedById, lockedAt, ...r }) => {
      const locked = isLockActive(lockedById, lockedAt);
      return {
        ...r,
        itemCount: _count.items,
        unseen: isUnseen(r),
        state: locked ? 'EN_USO' : 'ABIERTO',
        lockedByName: locked ? lockerMap.get(lockedById!) ?? null : null,
      };
    });
  }

  async findOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, fromPortal: true, status: true, portalNote: true, createdAt: true, clientUpdatedAt: true,
        totalUsd: true, totalBs: true,
        customer: { select: { id: true, name: true, code: true, documentType: true, rif: true } },
        seller: { select: { id: true, name: true } },
        items: { select: { productId: true, productName: true, quantity: true, totalUsd: true } },
      },
    });
    if (!inv || !inv.fromPortal) throw new NotFoundException('Pedido no encontrado');
    const codes = await this.prisma.product.findMany({
      where: { id: { in: inv.items.map((i) => i.productId) } },
      select: { id: true, code: true },
    });
    const codeMap = new Map(codes.map((p) => [p.id, p.code]));
    return { ...inv, items: inv.items.map((i) => ({ ...i, productCode: codeMap.get(i.productId) ?? null })) };
  }

  async markSeen(id: string) {
    await this.prisma.invoice.updateMany({ where: { id, fromPortal: true }, data: { staffSeenAt: new Date() } });
    return { ok: true };
  }

  // Vendedor con vendedor vinculado: solo cuenta los de SUS clientes. Resto de roles: todos.
  async unseenCount(user: { id: string; role: UserRole }) {
    const sellerId = user.role === 'SELLER' ? await this.sellerOf(user.id) : null;
    const rows = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS n FROM "Invoice"
      WHERE "fromPortal" = true AND status = 'PENDING'
        AND ("staffSeenAt" IS NULL OR "clientUpdatedAt" > "staffSeenAt")
        ${sellerId ? Prisma.sql`AND "sellerId" = ${sellerId}` : Prisma.empty}`);
    return { count: rows[0]?.n ?? 0 };
  }
}
