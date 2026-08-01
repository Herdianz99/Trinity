import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PartnerClient } from './partner-client.service';
import { getIntegrationConfig } from './integration.config';

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

  // Resuelve items {code,quantity} a snapshot con nombre y costo; valida existencia de producto.
  private async resolveItems(items: ItemInput[]): Promise<{ productId: string; snap: ItemSnapshot }[]> {
    if (!items?.length) throw new BadRequestException('El traslado no tiene items');
    const out: { productId: string; snap: ItemSnapshot }[] = [];
    for (const it of items) {
      const p = await this.prisma.product.findUnique({
        where: { code: it.code },
        select: { id: true, code: true, name: true, costUsd: true },
      });
      if (!p) throw new BadRequestException(`Producto no encontrado: ${it.code}`);
      if (!it.quantity || it.quantity <= 0) throw new BadRequestException(`Cantidad invalida para ${it.code}`);
      out.push({ productId: p.id, snap: { code: p.code, name: p.name, quantity: it.quantity, unitCost: p.costUsd } });
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

  // ── ENVIAR (push): descuenta MI stock y notifica al socio ──
  async send(dto: { fromWarehouseId: string; items: ItemInput[]; notes?: string }, userId: string) {
    if (!this.partner.isConfigured()) throw new BadRequestException('Integracion no configurada');
    if (!dto.fromWarehouseId) throw new BadRequestException('Falta el almacen origen');
    const resolved = await this.resolveItems(dto.items);

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
            createdById: userId,
          },
        });
      }
      return tx.partnerTransfer.create({
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
          items: resolved.map((r) => ({ code: r.snap.code, name: r.snap.name, quantity: r.snap.quantity, unitCost: 0 })) as any,
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

  // ── APROBAR una solicitud entrante: descuenta MI stock y la despacha ──
  async approve(id: string, dto: { fromWarehouseId: string }, userId: string) {
    const rec = await this.prisma.partnerTransfer.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Traslado no encontrado');
    if (rec.kind !== 'REQUEST' || rec.direction !== 'INCOMING' || rec.status !== 'REQUESTED') {
      throw new BadRequestException('Solo se aprueban solicitudes entrantes pendientes');
    }
    if (!dto.fromWarehouseId) throw new BadRequestException('Falta el almacen origen');
    const items = rec.items as unknown as ItemSnapshot[];
    const resolved = await this.resolveItems(items.map((i) => ({ code: i.code, quantity: i.quantity })));

    for (const r of resolved) {
      const st = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId: r.productId, warehouseId: dto.fromWarehouseId } },
      });
      if (!st || st.quantity < r.snap.quantity) {
        throw new BadRequestException(`Stock insuficiente de ${r.snap.code} (disponible ${st?.quantity ?? 0})`);
      }
    }

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
            createdById: userId,
          },
        });
      }
      return tx.partnerTransfer.update({
        where: { id },
        data: {
          status: 'SENT',
          fromWarehouseId: dto.fromWarehouseId,
          items: resolved.map((r) => r.snap) as any, // ahora con unitCost real
          notified: false,
        },
      });
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
            createdById: userId,
          },
        });
      }
      await tx.partnerTransfer.update({
        where: { id },
        data: { status: 'RECEIVED', toWarehouseId: dto.toWarehouseId },
      });
    });

    await this.partner.post(`/integration/transfers/${encodeURIComponent(rec.number)}/ack`, {});
    return this.prisma.partnerTransfer.findUnique({ where: { id } });
  }

  // ── Push del envio al socio (idempotente por number) ──
  private async pushIncoming(rec: { id: string; number: string; items: any; notes: string | null }) {
    const r = await this.partner.post('/integration/transfers/incoming', {
      number: rec.number,
      items: rec.items,
      notes: rec.notes,
    });
    if (r.ok) await this.prisma.partnerTransfer.update({ where: { id: rec.id }, data: { notified: true } });
  }

  // ═══ ENTRANTES (los llama el socio) ═══

  // El socio me ENVIA (o aprobo mi solicitud): registro/actualizo a PENDING_RECEIPT.
  async receiveIncoming(body: { number: string; items: any; notes?: string }) {
    const cfg = getIntegrationConfig();
    const existing = await this.prisma.partnerTransfer.findUnique({ where: { number: body.number } });
    if (existing) {
      // Solicitud mia que el socio aprobo: pasa a por-recibir con los items+costos que vienen
      if (existing.status === 'RECEIVED' || existing.status === 'PENDING_RECEIPT') return { ok: true };
      await this.prisma.partnerTransfer.update({
        where: { number: body.number },
        data: { status: 'PENDING_RECEIPT', items: body.items },
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
