import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerClient } from './partner-client.service';
import { getIntegrationConfig } from './integration.config';
import { caracasDateKey } from '../../common/timezone';
import { resolveBregaPct, effectiveCost, round2 } from '../../common/pricing';
import { buildCategoryBregaMap } from '../../common/category-brega';

interface ItemInput {
  code: string;
  quantity: number;
}
interface ItemSnapshot {
  code: string;
  name: string;
  quantity: number;
  unitCost: number;
}

// Traslados de inventario ENTRE EMPRESAS socias. Cada instancia mueve SOLO su propio
// stock (el que envia descuenta; el que recibe suma). Enlazados por `number`.
@Injectable()
export class PartnerTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partner: PartnerClient,
  ) {}

  private async nextNumber(tx: any): Promise<string> {
    const prefix = `${getIntegrationConfig().selfCode}-PTR-`;
    const last = await tx.partnerTransfer.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let n = 1;
    if (last) {
      const v = parseInt(last.number.slice(prefix.length), 10);
      if (!isNaN(v)) n = v + 1;
    }
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  private async currentRate(tx: any): Promise<number> {
    const r = await tx.exchangeRate.findUnique({ where: { date: caracasDateKey() } });
    return r?.rate || 0;
  }

  // Devuelve el userId solo si existe en ESTA base (createdById es FK). Evita romper
  // la operacion si llega un id de usuario de la otra empresa (o inexistente).
  private async safeUserId(tx: any, userId?: string): Promise<string | null> {
    if (!userId) return null;
    const u = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    return u ? userId : null;
  }

  // CxC en la empresa que ENVIA: el socio (cliente del grupo) le debe la mercancia (a costo).
  private async createReceivable(tx: any, opts: { partnerName: string; number: string; amountUsd: number; userId: string }) {
    if (opts.amountUsd <= 0) return;
    const rate = await this.currentRate(tx);
    const customer =
      (await tx.customer.findFirst({ where: { name: opts.partnerName } })) ??
      (await tx.customer.create({ data: { name: opts.partnerName, isGroupCompany: true } }));
    await tx.receivable.create({
      data: {
        type: 'MANUAL',
        customerId: customer.id,
        amountUsd: round2(opts.amountUsd),
        amountBs: round2(opts.amountUsd * rate),
        exchangeRate: rate,
        description: `Traslado a ${opts.partnerName} ${opts.number} (a costo)`,
        reference: opts.number,
        documentNumber: opts.number,
        status: 'PENDING',
        createdById: await this.safeUserId(tx, opts.userId),
      },
    });
  }

  // CxP en la empresa que RECIBE: le debe al socio (proveedor) la mercancia (a costo).
  private async createPayable(tx: any, opts: { partnerName: string; number: string; amountUsd: number; userId: string }) {
    if (opts.amountUsd <= 0) return;
    const rate = await this.currentRate(tx);
    const supplier =
      (await tx.supplier.findFirst({ where: { name: opts.partnerName } })) ??
      (await tx.supplier.create({ data: { name: opts.partnerName } }));
    const usd = round2(opts.amountUsd);
    const bs = round2(opts.amountUsd * rate);
    await tx.payable.create({
      data: {
        supplierId: supplier.id,
        amountUsd: usd,
        amountBs: bs,
        exchangeRate: rate,
        netPayableUsd: usd,
        netPayableBs: bs,
        description: `Traslado de ${opts.partnerName} ${opts.number} (a costo)`,
        documentNumber: opts.number,
        status: 'PENDING',
        createdById: await this.safeUserId(tx, opts.userId),
      },
    });
  }

  // Resuelve items {code,quantity} a snapshot con nombre y costo; valida existencia de producto.
  // costBasis: 'COST' = costo puro | 'COST_BREGA' = costo + brecha (si el producto lleva brecha),
  // igual que el ajuste de precios. El unitCost resultante es el que viaja y valora el CxC/CxP.
  private async resolveItems(
    items: ItemInput[],
    costBasis: 'COST' | 'COST_BREGA' = 'COST',
  ): Promise<{ productId: string; snap: ItemSnapshot }[]> {
    if (!items?.length) throw new BadRequestException('El traslado no tiene items');
    const bregaGlobalPct =
      costBasis === 'COST_BREGA'
        ? (await this.prisma.companyConfig.findUnique({ where: { id: 'singleton' } }))?.bregaGlobalPct || 0
        : 0;
    const catBregaMap = await buildCategoryBregaMap(this.prisma);
    const out: { productId: string; snap: ItemSnapshot }[] = [];
    for (const it of items) {
      const p = await this.prisma.product.findUnique({
        where: { code: it.code },
        select: { id: true, code: true, name: true, costUsd: true, bregaApplies: true, categoryId: true },
      });
      if (!p) throw new BadRequestException(`Producto no encontrado: ${it.code}`);
      if (!it.quantity || it.quantity <= 0) throw new BadRequestException(`Cantidad invalida para ${it.code}`);
      const bregaPct =
        costBasis === 'COST_BREGA'
          ? resolveBregaPct({
              bregaApplies: p.bregaApplies,
              categoryBregaPct: p.categoryId ? (catBregaMap.get(p.categoryId) ?? 0) : 0,
              bregaGlobalPct,
            })
          : 0;
      const unitCost = round2(effectiveCost(p.costUsd, bregaPct));
      out.push({ productId: p.id, snap: { code: p.code, name: p.name, quantity: it.quantity, unitCost } });
    }
    return out;
  }

  private list(where: any) {
    return this.prisma.partnerTransfer.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async findAll(query: { status?: string; direction?: string; kind?: string }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;
    if (query.kind) where.kind = query.kind;
    return this.list(where);
  }

  // Detalle por id O por numero (los movimientos de inventario enlazan por id).
  async findOne(key: string) {
    const rec = await this.prisma.partnerTransfer.findFirst({
      where: { OR: [{ id: key }, { number: key }] },
    });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    return rec;
  }

  // Stock disponible de los items de un traslado en un almacén dado (para la UI de aprobar).
  async availability(id: string, warehouseId: string): Promise<{ code: string; available: number }[]> {
    if (!warehouseId) throw new BadRequestException('Falta el almacen');
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    const items = rec.items as unknown as { code: string }[];
    const out: { code: string; available: number }[] = [];
    for (const it of items) {
      const p = await this.prisma.product.findUnique({ where: { code: it.code }, select: { id: true } });
      let available = 0;
      if (p) {
        const st = await this.prisma.stock.findUnique({
          where: { productId_warehouseId: { productId: p.id, warehouseId } },
        });
        available = st?.quantity ?? 0;
      }
      out.push({ code: it.code, available });
    }
    return out;
  }

  // ── ENVIAR (push): descuenta MI stock y notifica al socio ──
  async send(
    dto: { fromWarehouseId: string; items: ItemInput[]; notes?: string; costBasis?: 'COST' | 'COST_BREGA' },
    userId: string,
  ) {
    if (!this.partner.isConfigured()) throw new BadRequestException('Integracion no configurada');
    if (!dto.fromWarehouseId) throw new BadRequestException('Falta el almacen origen');
    const resolved = await this.resolveItems(dto.items, dto.costBasis);

    // Validar stock
    for (const r of resolved) {
      const st = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
      });
      if (!st || st.quantity < r.snap.quantity) {
        throw new BadRequestException(
          `Stock insuficiente de ${r.snap.code} (disponible ${st?.quantity ?? 0}, requiere ${r.snap.quantity})`,
        );
      }
    }

    const cfg = getIntegrationConfig();
    const record = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx);
      // Se crea el registro PRIMERO para tener su id y enlazarlo en los movimientos (sourceId).
      const rec = await tx.partnerTransfer.create({
        data: {
          number,
          kind: 'SEND',
          direction: 'OUTGOING',
          status: 'SENT',
          partnerName: cfg.partnerName,
          notes: dto.notes ?? null,
          items: resolved.map((r) => r.snap) as any,
          fromWarehouseId: dto.fromWarehouseId,
          notified: false,
          createdById: userId,
        },
      });
      for (const r of resolved) {
        const st = await tx.stock.update({
          where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
          data: { quantity: { decrement: r.snap.quantity } },
        });
        if (st.quantity < 0) throw new BadRequestException(`Stock insuficiente de ${r.snap.code}`);
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            warehouseId: dto.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -r.snap.quantity,
            costUsd: r.snap.unitCost,
            stockAfter: st.quantity,
            reason: `Traslado a ${cfg.partnerName} ${number}`,
            reference: number,
            sourceType: 'PARTNER_TRANSFER',
            sourceId: rec.id,
            createdById: userId,
          },
        });
      }
      await this.createReceivable(tx, {
        partnerName: cfg.partnerName,
        number,
        amountUsd: resolved.reduce((s, r) => s + r.snap.unitCost * r.snap.quantity, 0),
        userId,
      });
      return rec;
    });

    await this.pushIncoming(record);
    return this.prisma.partnerTransfer.findUnique({ where: { id: record.id } });
  }

  // ── SOLICITAR (request): pido stock al socio ──
  async request(dto: { items: ItemInput[]; notes?: string }, userId: string) {
    if (!this.partner.isConfigured()) throw new BadRequestException('Integracion no configurada');
    const resolved = await this.resolveItems(dto.items);
    const cfg = getIntegrationConfig();
    const record = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx);
      return tx.partnerTransfer.create({
        data: {
          number,
          kind: 'REQUEST',
          direction: 'OUTGOING',
          status: 'REQUESTED',
          partnerName: cfg.partnerName,
          notes: dto.notes ?? null,
          items: resolved.map((r) => ({ code: r.snap.code, name: r.snap.name, requestedQuantity: r.snap.quantity, quantity: r.snap.quantity, unitCost: 0 })) as any,
          notified: false,
          createdById: userId,
        },
      });
    });
    const r = await this.partner.post('/integration/transfers/requests', {
      number: record.number,
      items: record.items,
      notes: record.notes,
    });
    if (r.ok) await this.prisma.partnerTransfer.update({ where: { id: record.id }, data: { notified: true } });
    return this.prisma.partnerTransfer.findUnique({ where: { id: record.id } });
  }

  // ── APROBAR una solicitud entrante: el que ENVIA decide la cantidad por línea ──
  async approve(
    id: string,
    dto: {
      fromWarehouseId: string;
      costBasis?: 'COST' | 'COST_BREGA';
      sendNote?: string;
      items?: { code: string; sendQuantity: number }[];
    },
    userId: string,
  ) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    if (rec.kind !== 'REQUEST' || rec.direction !== 'INCOMING' || rec.status !== 'REQUESTED') {
      throw new BadRequestException('Solo se aprueban solicitudes entrantes pendientes');
    }
    if (!dto.fromWarehouseId) throw new BadRequestException('Falta el almacen origen');

    // Snapshot solicitado. requestedQuantity: si no viene (traslados viejos) usa quantity.
    const reqItems = rec.items as unknown as (ItemSnapshot & { requestedQuantity?: number })[];
    const reqMap = new Map(reqItems.map((i) => [i.code, i.requestedQuantity ?? i.quantity]));

    // Cantidad a enviar por linea: del dto.items si viene; si no, lo solicitado (compat).
    const sendMap = new Map<string, number>();
    if (dto.items?.length) for (const it of dto.items) sendMap.set(it.code, Number(it.sendQuantity) || 0);
    const sendOf = (code: string) =>
      dto.items?.length ? (sendMap.get(code) ?? 0) : (reqMap.get(code) as number);

    const toSend = reqItems.map((i) => ({ code: i.code, send: sendOf(i.code) })).filter((x) => x.send > 0);
    if (toSend.length === 0) throw new BadRequestException('No hay nada que enviar; usa Rechazar');

    // Solo las lineas con cantidad > 0 se resuelven (costo/nombre) y descuentan.
    const resolved = await this.resolveItems(toSend.map((x) => ({ code: x.code, quantity: x.send })), dto.costBasis);
    const costMap = new Map(resolved.map((r) => [r.snap.code, r.snap.unitCost]));

    // Validar stock disponible por linea (tope = stock; sin negativos).
    for (const r of resolved) {
      const st = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
      });
      if (!st || st.quantity < r.snap.quantity) {
        throw new BadRequestException(
          `Solo tienes ${st?.quantity ?? 0} de ${r.snap.code} (quieres enviar ${r.snap.quantity})`,
        );
      }
    }

    // Snapshot COMPLETO (incluye lineas en 0) para mostrar "Solicitaste X / Enviaste Y" en ambos lados.
    const fullItems = reqItems.map((i) => {
      const send = sendOf(i.code);
      return {
        code: i.code,
        name: i.name,
        requestedQuantity: reqMap.get(i.code) ?? i.quantity,
        quantity: send,
        unitCost: send > 0 ? (costMap.get(i.code) ?? 0) : 0,
      };
    });

    const cfg = getIntegrationConfig();
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const st = await tx.stock.update({
          where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
          data: { quantity: { decrement: r.snap.quantity } },
        });
        if (st.quantity < 0) throw new BadRequestException(`Stock insuficiente de ${r.snap.code}`);
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            warehouseId: dto.fromWarehouseId,
            type: 'TRANSFER_OUT',
            quantity: -r.snap.quantity,
            costUsd: r.snap.unitCost,
            stockAfter: st.quantity,
            reason: `Traslado a ${cfg.partnerName} ${rec.number} (solicitud aprobada)`,
            reference: rec.number,
            sourceType: 'PARTNER_TRANSFER',
            sourceId: id,
            createdById: userId,
          },
        });
      }
      const upd = await tx.partnerTransfer.update({
        where: { id },
        data: {
          status: 'SENT',
          fromWarehouseId: dto.fromWarehouseId,
          items: fullItems as any,
          sendNote: dto.sendNote ?? null,
          notified: false,
        },
      });
      await this.createReceivable(tx, {
        partnerName: cfg.partnerName,
        number: rec.number,
        amountUsd: resolved.reduce((s, r) => s + r.snap.unitCost * r.snap.quantity, 0),
        userId,
      });
      return upd;
    });

    await this.pushIncoming(updated);
    return this.prisma.partnerTransfer.findUnique({ where: { id } });
  }

  // ── RECHAZAR una solicitud entrante ──
  async reject(id: string) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    if (rec.kind !== 'REQUEST' || rec.direction !== 'INCOMING' || rec.status !== 'REQUESTED') {
      throw new BadRequestException('Solo se rechazan solicitudes entrantes pendientes');
    }
    const updated = await this.prisma.partnerTransfer.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.partner.post(`/integration/transfers/${encodeURIComponent(rec.number)}/rejected`, {});
    return updated;
  }

  // ── RECIBIR: suma MI stock y avisa al socio (ack) ──
  async receive(id: string, dto: { toWarehouseId: string }, userId: string) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    if (rec.status !== 'PENDING_RECEIPT') throw new BadRequestException('El traslado no esta por recibir');
    if (!dto.toWarehouseId) throw new BadRequestException('Falta el almacen destino');
    const items = rec.items as unknown as ItemSnapshot[];

    // Todos los productos deben existir localmente
    const missing: string[] = [];
    const resolved: { productId: string; snap: ItemSnapshot }[] = [];
    for (const it of items) {
      if (!it.quantity || it.quantity <= 0) continue; // línea no enviada (0): no suma stock
      const p = await this.prisma.product.findUnique({ where: { code: it.code }, select: { id: true } });
      if (!p) missing.push(it.code);
      else resolved.push({ productId: p.id, snap: it });
    }
    if (missing.length) {
      throw new BadRequestException(`Faltan productos localmente (sincroniza primero): ${missing.join(', ')}`);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const r of resolved) {
        const st = await tx.stock.upsert({
          where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.toWarehouseId } },
          create: { productId: r.productId, warehouseId: dto.toWarehouseId, quantity: r.snap.quantity },
          update: { quantity: { increment: r.snap.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            warehouseId: dto.toWarehouseId,
            type: 'TRANSFER_IN',
            quantity: r.snap.quantity,
            costUsd: r.snap.unitCost,
            stockAfter: st.quantity,
            reason: `Traslado de ${rec.partnerName} ${rec.number} (entrada)`,
            reference: rec.number,
            sourceType: 'PARTNER_TRANSFER',
            sourceId: id,
            createdById: userId,
          },
        });
      }
      await tx.partnerTransfer.update({
        where: { id },
        data: { status: 'RECEIVED', toWarehouseId: dto.toWarehouseId },
      });
      await this.createPayable(tx, {
        partnerName: rec.partnerName,
        number: rec.number,
        amountUsd: items.reduce((s, i) => s + (i.unitCost || 0) * i.quantity, 0),
        userId,
      });
    });

    await this.partner.post(`/integration/transfers/${encodeURIComponent(rec.number)}/ack`, {});
    return this.prisma.partnerTransfer.findUnique({ where: { id } });
  }

  // ── Push del envio al socio (idempotente por number) ──
  private async pushIncoming(rec: { id: string; number: string; items: any; notes: string | null; sendNote?: string | null }) {
    const r = await this.partner.post('/integration/transfers/incoming', {
      number: rec.number,
      items: rec.items,
      notes: rec.notes,
      sendNote: (rec as any).sendNote ?? null,
    });
    if (r.ok) await this.prisma.partnerTransfer.update({ where: { id: rec.id }, data: { notified: true } });
  }

  // ═══ ENTRANTES (los llama el socio) ═══

  // El socio me ENVIA (o aprobo mi solicitud): registro/actualizo a PENDING_RECEIPT.
  async receiveIncoming(body: { number: string; items: any; notes?: string; sendNote?: string }) {
    const cfg = getIntegrationConfig();
    const existing = await this.prisma.partnerTransfer.findUnique({ where: { number: body.number } });
    if (existing) {
      // Solicitud mia que el socio aprobo: pasa a por-recibir con los items+costos que vienen
      if (existing.status === 'RECEIVED' || existing.status === 'PENDING_RECEIPT') return { ok: true };
      await this.prisma.partnerTransfer.update({
        where: { number: body.number },
        data: { status: 'PENDING_RECEIPT', items: body.items, sendNote: body.sendNote ?? existing.sendNote },
      });
      return { ok: true };
    }
    await this.prisma.partnerTransfer.create({
      data: {
        number: body.number,
        kind: 'SEND',
        direction: 'INCOMING',
        status: 'PENDING_RECEIPT',
        partnerName: cfg.partnerName,
        notes: body.notes ?? null,
        sendNote: body.sendNote ?? null,
        items: body.items,
        notified: true,
      },
    });
    return { ok: true };
  }

  // El socio me SOLICITA: registro una solicitud entrante.
  async receiveRequest(body: { number: string; items: any; notes?: string }) {
    const cfg = getIntegrationConfig();
    const existing = await this.prisma.partnerTransfer.findUnique({ where: { number: body.number } });
    if (existing) return { ok: true };
    await this.prisma.partnerTransfer.create({
      data: {
        number: body.number,
        kind: 'REQUEST',
        direction: 'INCOMING',
        status: 'REQUESTED',
        partnerName: cfg.partnerName,
        notes: body.notes ?? null,
        items: body.items,
        notified: true,
      },
    });
    return { ok: true };
  }

  // El socio confirma que recibio mi envio.
  async ack(number: string) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { number } });
    if (rec && rec.status !== 'RECEIVED') {
      await this.prisma.partnerTransfer.update({ where: { number }, data: { status: 'RECEIVED' } });
    }
    return { ok: true };
  }

  // El socio rechazo mi solicitud.
  async rejected(number: string) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { number } });
    if (rec && rec.status === 'REQUESTED') {
      await this.prisma.partnerTransfer.update({ where: { number }, data: { status: 'REJECTED' } });
    }
    return { ok: true };
  }

  // ── Red de seguridad: reintentar envios no notificados ──
  async retryUnnotified(): Promise<number> {
    if (!this.partner.isConfigured()) return 0;
    const pend = await this.prisma.partnerTransfer.findMany({
      where: { status: 'SENT', notified: false },
      take: 50,
    });
    let done = 0;
    for (const rec of pend) {
      await this.pushIncoming(rec as any);
      done++;
    }
    return done;
  }
}
