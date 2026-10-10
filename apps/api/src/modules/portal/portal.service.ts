import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { InvoicesService, isLockActive } from '../invoices/invoices.service';
import { MeService } from '../me/me.service';
import { caracasDateKey } from '../../common/timezone';
import { PortalOrderDto, PortalOrderItemDto } from './dto/portal-order.dto';

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const r3 = (n: number) => Math.round((n || 0) * 1000) / 1000;
const LOCKED_MSG = 'El pedido está siendo procesado por la empresa y no se puede modificar.';

type OrderState = 'ABIERTO' | 'EN_USO';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private products: ProductsService,
    private invoices: InvoicesService,
    private me: MeService,
  ) {}

  // Cliente del usuario logueado. SIEMPRE desde la BD (nunca del body ni del token).
  async resolveCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true, role: true,
        customer: {
          select: { id: true, name: true, code: true, documentType: true, rif: true, isActive: true, sellerId: true },
        },
      },
    });
    if (!user || !user.isActive || user.role !== 'CLIENT' || !user.customer || !user.customer.isActive) {
      throw new ForbiddenException('Tu usuario no tiene acceso al portal.');
    }
    return user.customer;
  }

  private async todayRate(): Promise<number | null> {
    const rate = await this.prisma.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    return rate?.rate ?? null;
  }

  private async assertRate() {
    if (!(await this.todayRate())) {
      throw new BadRequestException('Todavía no está cargada la tasa del día. Intenta de nuevo más tarde.');
    }
  }

  // Existencia vendible = suma de almacenes que cuentan para la venta (igual que el POS).
  private sellableStock(stock: { quantity: number; warehouse?: { countsForSale?: boolean | null } | null }[]) {
    return stock.reduce((s, x) => s + (x.warehouse?.countsForSale === false ? 0 : x.quantity || 0), 0);
  }

  // DTO SEGURO: nunca costo, % ganancia, proveedor, precio mayor ni stock por almacen.
  private toPortalProduct(p: any, reserved: Record<string, number>, rate: number | null) {
    const stock = r3(this.sellableStock(p.stock ?? []));
    return {
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      description: (p.description ?? null) as string | null,
      thumbUrl: (p.primaryImageThumbUrl ?? null) as string | null,
      imageUrl: (p.primaryImageMediumUrl ?? p.primaryImageThumbUrl ?? null) as string | null,
      priceUsd: p.priceDetal as number,
      priceBs: rate ? r2(p.priceDetal * rate) : null,
      isOnSale: !!p.isOnSale,
      isService: !!p.isService,
      stock,
      available: r3(stock - (reserved[p.id] || 0)),
    };
  }

  private orderState(inv: { lockedById: string | null; lockedAt: Date | null }): OrderState {
    return isLockActive(inv.lockedById, inv.lockedAt) ? 'EN_USO' : 'ABIERTO';
  }

  // Une renglones repetidos del mismo producto (suma cantidades).
  private mergeItems(items: PortalOrderItemDto[]) {
    const map = new Map<string, number>();
    for (const it of items) map.set(it.productId, r3((map.get(it.productId) || 0) + it.quantity));
    return [...map.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  }

  private async ownOrder(customerId: string, id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: { id: true, customerId: true, fromPortal: true, status: true, lockedById: true, lockedAt: true },
    });
    if (!inv || inv.customerId !== customerId || !inv.fromPortal) throw new NotFoundException('Pedido no encontrado');
    if (inv.status !== 'PENDING') throw new ConflictException('Este pedido ya fue procesado por la empresa.');
    return inv;
  }

  // ---------- Datos del portal ----------

  async getMe(userId: string) {
    const c = await this.resolveCustomer(userId);
    const [cfg, rate] = await Promise.all([
      this.prisma.companyConfig.findUnique({
        where: { id: 'singleton' },
        select: { companyName: true, allowNegativeStock: true },
      }),
      this.todayRate(),
    ]);
    return {
      customer: { name: c.name, code: c.code, documentType: c.documentType, rif: c.rif },
      companyName: cfg?.companyName ?? '',
      allowNegativeStock: cfg?.allowNegativeStock ?? true,
      rate,
    };
  }

  // MISMA busqueda del POS (ProductsService.findAll: tolerante a P/, tildes y orden de
  // palabras; 500 resultados; ofertas primero). Solo se quitan los bloqueados y sin precio.
  async searchProducts(userId: string, search: string) {
    await this.resolveCustomer(userId);
    const q = (search || '').trim();
    if (!q) return { data: [], total: 0 };
    const [res, reserved, rate] = await Promise.all([
      this.products.findAll({ search: q, limit: 500, page: 1, onSaleFirst: true }),
      this.invoices.getReservedStock(),
      this.todayRate(),
    ]);
    const data = res.data
      .filter((p: any) => !p.saleBlocked && p.priceDetal > 0)
      .map((p: any) => this.toPortalProduct(p, reserved, rate));
    return { data, total: data.length };
  }

  // ---------- Pedidos ----------

  async listOrders(userId: string) {
    const c = await this.resolveCustomer(userId);
    const rows = await this.prisma.invoice.findMany({
      where: { customerId: c.id, status: 'PENDING', fromPortal: true },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true,
        totalUsd: true, totalBs: true, lockedById: true, lockedAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ lockedById, lockedAt, _count, ...r }) => ({
      ...r,
      itemCount: _count.items,
      state: this.orderState({ lockedById, lockedAt }),
    }));
  }

  async getOrder(userId: string, id: string) {
    const c = await this.resolveCustomer(userId);
    await this.ownOrder(c.id, id);
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true, portalNote: true, createdAt: true, clientUpdatedAt: true, lockedById: true, lockedAt: true,
        items: { select: { productId: true, productName: true, quantity: true } },
      },
    });
    if (!inv) throw new NotFoundException('Pedido no encontrado');
    const productIds = inv.items.map((i) => i.productId);
    const [products, reserved, rate] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { stock: { include: { warehouse: { select: { countsForSale: true } } } } },
      }),
      this.invoices.getReservedStock(),
      this.todayRate(),
    ]);
    const pmap = new Map(products.map((p) => [p.id, this.toPortalProduct(p, reserved, rate)]));
    return {
      id: inv.id,
      portalNote: inv.portalNote,
      createdAt: inv.createdAt,
      clientUpdatedAt: inv.clientUpdatedAt,
      state: this.orderState(inv),
      items: inv.items.map((it) => {
        const p = pmap.get(it.productId);
        return {
          productId: it.productId,
          code: p?.code ?? '',
          name: p?.name ?? it.productName,
          thumbUrl: p?.thumbUrl ?? null,
          // Precio ACTUAL (referencial): se factura al precio y tasa del dia del despacho.
          priceUsd: p?.priceUsd ?? 0,
          isService: p?.isService ?? false,
          stock: p?.stock ?? 0,
          // El reservado incluye a este mismo pedido: se le suma su cantidad para que el
          // cliente vea lo que realmente le queda disponible.
          available: r3((p?.available ?? 0) + it.quantity),
          quantity: it.quantity,
        };
      }),
    };
  }

  async createOrder(userId: string, dto: PortalOrderDto) {
    const c = await this.resolveCustomer(userId);
    await this.assertRate();
    // Precio de lista y descuento 0 SIEMPRE: el DTO del portal no trae precio ni descuento.
    const inv = await this.invoices.create(
      { customerId: c.id, sellerId: c.sellerId ?? undefined, items: this.mergeItems(dto.items) },
      { id: userId, role: UserRole.CLIENT },
      { fromPortal: true, portalNote: dto.portalNote?.trim() || null, clientUpdatedAt: new Date() },
    );
    return this.getOrder(userId, inv.id);
  }

  async updateOrder(userId: string, id: string, dto: PortalOrderDto) {
    const c = await this.resolveCustomer(userId);
    const inv = await this.ownOrder(c.id, id);
    if (this.orderState(inv) === 'EN_USO') throw new ConflictException(LOCKED_MSG);
    await this.assertRate();
    await this.invoices.updateItems(
      id,
      { customerId: c.id, items: this.mergeItems(dto.items) },
      { id: userId, role: UserRole.CLIENT },
      { extra: { portalNote: dto.portalNote?.trim() || null, clientUpdatedAt: new Date() }, rejectIfLocked: true },
    );
    return this.getOrder(userId, id);
  }

  async deleteOrder(userId: string, id: string) {
    const c = await this.resolveCustomer(userId);
    const inv = await this.ownOrder(c.id, id);
    if (this.orderState(inv) === 'EN_USO') throw new ConflictException(LOCKED_MSG);
    return this.invoices.delete(id, { id: userId, role: UserRole.CLIENT });
  }

  // ---------- Mi cuenta ----------

  async cuentaCxc(userId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerCxc(c.id);
  }

  async cuentaFacturas(userId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerFacturas(c.id, { excludePending: true });
  }

  async cuentaFacturaPdf(userId: string, invoiceId: string) {
    const c = await this.resolveCustomer(userId);
    return this.me.customerFacturaPdf(c.id, invoiceId);
  }
}
