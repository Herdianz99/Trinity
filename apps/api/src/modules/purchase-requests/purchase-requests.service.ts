import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateSupplierOrderItemDto,
  UpdateSupplierOrderItemDto,
  ReceiveSupplierOrderItemDto,
  UploadSupplierOrderDto,
  SupplierOrderRowDto,
} from './dto/purchase-request.dto';

@Injectable()
export class PurchaseRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // Resuelve el producto de un "CODIGO" del Excel: primero por ref. proveedor
  // (supplierRef), luego por codigo interno (code). Devuelve nulls si no matchea.
  private async resolveProduct(
    supplierRef: string,
  ): Promise<{ productId: string | null; productCode: string | null }> {
    const ref = (supplierRef || '').trim();
    if (!ref) return { productId: null, productCode: null };

    const byRef = await this.prisma.product.findFirst({
      where: { supplierRef: ref },
      select: { id: true, code: true },
    });
    if (byRef) return { productId: byRef.id, productCode: byRef.code };

    const byCode = await this.prisma.product.findUnique({
      where: { code: ref },
      select: { id: true, code: true },
    });
    if (byCode) return { productId: byCode.id, productCode: byCode.code };

    return { productId: null, productCode: null };
  }

  async findAll(params: {
    status?: 'PENDING' | 'RECEIVED' | 'ALL';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status = 'ALL', search, page = 1, limit = 50 } = params;
    const where: Prisma.SupplierOrderItemWhereInput = {};
    if (status === 'PENDING' || status === 'RECEIVED') {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { supplierRef: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { productCode: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total, pendingCount, receivedCount] = await Promise.all([
      this.prisma.supplierOrderItem.findMany({
        where,
        // Pendientes primero, y dentro de cada grupo lo mas reciente arriba.
        orderBy: [{ status: 'asc' }, { orderedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          product: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.supplierOrderItem.count({ where }),
      this.prisma.supplierOrderItem.count({ where: { status: 'PENDING' } }),
      this.prisma.supplierOrderItem.count({ where: { status: 'RECEIVED' } }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      counts: { pending: pendingCount, received: receivedCount },
    };
  }

  async create(dto: CreateSupplierOrderItemDto, userId: string) {
    const { productId, productCode } = await this.resolveProduct(dto.supplierRef);
    return this.prisma.supplierOrderItem.create({
      data: {
        supplierRef: dto.supplierRef.trim(),
        description: dto.description.trim(),
        quantityOrdered: dto.quantityOrdered,
        unitCost: dto.unitCost ?? null,
        supplierName: dto.supplierName?.trim() || null,
        observation: dto.observation?.trim() || null,
        productId,
        productCode,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateSupplierOrderItemDto) {
    const existing = await this.prisma.supplierOrderItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido no encontrado');

    const data: Prisma.SupplierOrderItemUpdateInput = {};
    if (dto.supplierRef !== undefined) data.supplierRef = dto.supplierRef.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.quantityOrdered !== undefined) data.quantityOrdered = dto.quantityOrdered;
    if (dto.unitCost !== undefined) data.unitCost = dto.unitCost;
    if (dto.supplierName !== undefined) data.supplierName = dto.supplierName?.trim() || null;
    if (dto.observation !== undefined) data.observation = dto.observation?.trim() || null;

    // Si cambio la ref, re-resolver el producto enlazado.
    if (dto.supplierRef !== undefined && dto.supplierRef.trim() !== existing.supplierRef) {
      const { productId, productCode } = await this.resolveProduct(dto.supplierRef);
      data.product = productId ? { connect: { id: productId } } : { disconnect: true };
      data.productCode = productCode;
    }

    return this.prisma.supplierOrderItem.update({ where: { id }, data });
  }

  // Marcado manual de recibido (algo que llego pero no se cargo como compra).
  async receiveManual(id: string, dto: ReceiveSupplierOrderItemDto) {
    const existing = await this.prisma.supplierOrderItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido no encontrado');
    return this.prisma.supplierOrderItem.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        // Si no envian cantidad, se asume que llego lo pedido.
        quantityReceived: dto.quantityReceived ?? existing.quantityOrdered,
      },
    });
  }

  // Revertir a pendiente (por si se marco recibido por error).
  async unreceive(id: string) {
    const existing = await this.prisma.supplierOrderItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido no encontrado');
    return this.prisma.supplierOrderItem.update({
      where: { id },
      data: {
        status: 'PENDING',
        receivedAt: null,
        quantityReceived: null,
        receivedPurchaseOrderId: null,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.supplierOrderItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido no encontrado');
    await this.prisma.supplierOrderItem.delete({ where: { id } });
    return { ok: true };
  }

  // Normaliza las filas del Excel: descarta las que no tienen codigo o descripcion.
  private normalizeRows(rows: SupplierOrderRowDto[]) {
    const valid: SupplierOrderRowDto[] = [];
    let discarded = 0;
    for (const r of rows || []) {
      const ref = (r.supplierRef ?? '').toString().trim();
      const desc = (r.description ?? '').toString().trim();
      const qty = Number(r.quantityOrdered);
      if (!ref || !desc || !Number.isFinite(qty)) {
        discarded++;
        continue;
      }
      valid.push({
        supplierRef: ref,
        description: desc,
        quantityOrdered: qty,
        unitCost: r.unitCost != null && Number.isFinite(Number(r.unitCost)) ? Number(r.unitCost) : undefined,
      });
    }
    return { valid, discarded };
  }

  // Preview de la carga: resuelve enlaces a producto pero NO escribe nada.
  async uploadPreview(dto: UploadSupplierOrderDto) {
    const { valid, discarded } = this.normalizeRows(dto.rows);
    let linked = 0;
    const preview = [];
    for (const row of valid) {
      const { productId, productCode } = await this.resolveProduct(row.supplierRef);
      if (productId) linked++;
      preview.push({ ...row, productId, productCode, linked: !!productId });
    }
    return {
      totalRows: valid.length,
      linked,
      unlinked: valid.length - linked,
      discarded,
      rows: preview,
    };
  }

  // Confirmar la carga: re-resuelve el producto server-side e inserta.
  async uploadConfirm(dto: UploadSupplierOrderDto, userId: string) {
    const { valid } = this.normalizeRows(dto.rows);
    const supplierName = dto.supplierName?.trim() || null;
    const orderedAt = new Date(); // fecha del pedido = dia de la carga

    let created = 0;
    for (const row of valid) {
      const { productId, productCode } = await this.resolveProduct(row.supplierRef);
      await this.prisma.supplierOrderItem.create({
        data: {
          supplierRef: row.supplierRef,
          description: row.description,
          quantityOrdered: row.quantityOrdered,
          unitCost: row.unitCost ?? null,
          supplierName,
          orderedAt,
          productId,
          productCode,
          createdById: userId,
        },
      });
      created++;
    }
    return { created };
  }

  // ==========================================================================
  // HOOK: al procesar una factura de compra, marcar recibido el pedido pendiente
  // mas antiguo (FIFO) que coincida con cada articulo de la factura.
  // Se invoca DESPUES del commit de la compra y envuelto en try/catch por el
  // llamador, para que NUNCA pueda romper el procesamiento de la factura.
  // ==========================================================================
  async markReceivedFromBill(order: {
    id: string;
    processedAt?: Date | null;
    items?: Array<{
      quantity: number;
      product?: { id: string; code: string; supplierRef: string | null } | null;
    }>;
  }): Promise<{ matched: number }> {
    const receivedAt = order.processedAt || new Date();
    let matched = 0;

    for (const item of order.items || []) {
      const product = item.product;
      if (!product) continue;

      // Prioridad: productId enlazado > ref. proveedor > codigo interno.
      const or: Prisma.SupplierOrderItemWhereInput[] = [{ productId: product.id }];
      if (product.supplierRef) or.push({ supplierRef: product.supplierRef });
      or.push({ supplierRef: product.code });

      const pending = await this.prisma.supplierOrderItem.findFirst({
        where: { status: 'PENDING', OR: or },
        orderBy: { orderedAt: 'asc' }, // FIFO: el pendiente mas antiguo
      });
      if (!pending) continue;

      await this.prisma.supplierOrderItem.update({
        where: { id: pending.id },
        data: {
          status: 'RECEIVED',
          receivedAt,
          quantityReceived: item.quantity,
          receivedPurchaseOrderId: order.id,
        },
      });
      matched++;
    }

    return { matched };
  }
}
