import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateDamageReportDto } from './dto/create-damage-report.dto';
import { QueryDamageReportsDto } from './dto/query-damage-reports.dto';

@Injectable()
export class DamageReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  // Convierte las keys de Spaces de los items en URLs de CDN.
  private withPhotoUrls(report: any) {
    return {
      ...report,
      items: (report.items || []).map((it: any) => ({
        ...it,
        photos: (it.photos || []).map((p: any) => ({
          id: p.id,
          thumbUrl: this.spaces.cdnUrl(p.thumbKey),
          mediumUrl: this.spaces.cdnUrl(p.mediumKey),
        })),
      })),
    };
  }

  private async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "DamageReport" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `DMG-${next.toString().padStart(4, '0')}`;
  }

  private async generateReplacementNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "InventoryReplacement" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `REP-${next.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateDamageReportDto, userId: string) {
    if (!dto.items?.length) throw new BadRequestException('El reporte debe tener al menos un artículo');

    // Fotos de evidencia opcionales (tope por reporte para no abusar de Spaces).
    const totalPhotos = dto.items.reduce((n, it) => n + (it.photos?.length || 0), 0);
    if (totalPhotos > 30) {
      throw new BadRequestException('Máximo 30 fotos por reporte');
    }

    // Almacén destino: el enviado, el por defecto de la empresa, o el marcado isDefault.
    const config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
      select: { defaultWarehouseId: true },
    });
    let warehouseId = dto.warehouseId || config?.defaultWarehouseId || undefined;
    if (!warehouseId) {
      const fallback =
        (await this.prisma.warehouse.findFirst({ where: { isDefault: true }, select: { id: true } })) ||
        (await this.prisma.warehouse.findFirst({ where: { isActive: true }, select: { id: true } }));
      warehouseId = fallback?.id;
    }
    if (!warehouseId) {
      throw new BadRequestException('No hay almacén configurado; indica el almacén');
    }
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new BadRequestException('Almacén no encontrado');

    // Snapshot de productos.
    const productIds = dto.items.map((it) => it.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true, name: true },
    });
    const prodMap = new Map(products.map((p) => [p.id, p]));
    for (const it of dto.items) {
      if (!prodMap.has(it.productId)) {
        throw new BadRequestException(`Producto ${it.productId} no encontrado`);
      }
    }

    // Subir fotos a Spaces ANTES de crear la fila (patrón incidents). Se agrupan por índice de ítem.
    const date = caracasDateKey(dto.date);
    const uploadedByItem: { thumbKey: string; mediumKey: string }[][] = [];
    const allUploaded: { thumbKey: string; mediumKey: string }[] = [];
    try {
      for (const it of dto.items) {
        const itemUploads: { thumbKey: string; mediumKey: string }[] = [];
        for (const photo of it.photos || []) {
          let processed;
          try {
            processed = await processProductImage(dataUriToBuffer(photo));
          } catch {
            throw new BadRequestException('Una de las fotos no es una imagen válida');
          }
          const stamp = Date.now().toString(36);
          const rand = Math.random().toString(36).slice(2, 8);
          const thumbKey = `damage-reports/${stamp}-${rand}-thumb.webp`;
          const mediumKey = `damage-reports/${stamp}-${rand}-medium.webp`;
          await Promise.all([
            this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
            this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
          ]);
          itemUploads.push({ thumbKey, mediumKey });
          allUploaded.push({ thumbKey, mediumKey });
        }
        uploadedByItem.push(itemUploads);
      }

      const report = await this.prisma.$transaction(async (tx) => {
        const number = await this.generateNumber(tx);
        return tx.damageReport.create({
          data: {
            number,
            date,
            zone: dto.zone.trim(),
            warehouseId,
            notes: dto.notes?.trim() || null,
            status: 'PENDIENTE',
            createdById: userId,
            items: {
              create: dto.items.map((it, idx) => {
                const p = prodMap.get(it.productId)!;
                return {
                  productId: it.productId,
                  productName: p.name,
                  productCode: p.code,
                  quantity: it.quantity,
                  note: it.note?.trim() || null,
                  photos: { create: uploadedByItem[idx] },
                };
              }),
            },
          },
          include: {
            warehouse: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
            items: { include: { photos: true } },
          },
        });
      });
      return this.withPhotoUrls(report);
    } catch (e) {
      await Promise.all(
        allUploaded.flatMap((u) => [this.spaces.delete(u.thumbKey), this.spaces.delete(u.mediumKey)]),
      );
      throw e;
    }
  }

  async findAll(query: QueryDamageReportsDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.zone) where.zone = { contains: query.zone, mode: 'insensitive' };
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = caracasDateKey(query.from);
      if (query.to) where.date.lte = caracasDateKey(query.to);
    }
    const data = await this.prisma.damageReport.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        processedBy: { select: { name: true } },
        replacement: { select: { id: true, number: true, status: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return data;
  }

  async findOne(id: string) {
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        processedBy: { select: { name: true } },
        replacement: { select: { id: true, number: true, status: true } },
        items: { include: { photos: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!report) throw new NotFoundException(`Reporte ${id} no encontrado`);
    return this.withPhotoUrls(report);
  }

  private async assertPendiente(id: string) {
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!report) throw new NotFoundException(`Reporte ${id} no encontrado`);
    if (report.status !== 'PENDIENTE') {
      throw new BadRequestException('Solo se pueden procesar reportes pendientes');
    }
  }

  /**
   * (Auditor) Crea un reemplazo DRAFT enlazado y pone el reporte EN_PROCESO (NO procesado).
   * El reporte solo pasa a PROCESADO cuando ese reemplazo se procesa de verdad (mueve stock);
   * ese enganche vive en inventory-replacements.service. Si el auditor abandona el borrador,
   * puede "Deshacer reemplazo" (cancelReplacement) para volver a PENDIENTE y elegir merma.
   * No pre-crea líneas: el modelo de reemplazo exige el artículo que ENTRA, que el auditor
   * elige en el editor de reemplazos (con su buscador de productos).
   */
  async generateReplacement(id: string, userId: string) {
    await this.assertPendiente(id);
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      select: { number: true, warehouseId: true },
    });
    if (!report) throw new NotFoundException(`Reporte ${id} no encontrado`);

    return this.prisma.$transaction(async (tx) => {
      const number = await this.generateReplacementNumber(tx);
      const replacement = await tx.inventoryReplacement.create({
        data: {
          number,
          warehouseId: report.warehouseId,
          date: caracasDateKey(),
          notes: `Origen: reporte de daños ${report.number}`,
          status: 'DRAFT',
          createdById: userId,
        },
        select: { id: true, number: true },
      });
      await tx.damageReport.update({
        where: { id },
        data: { status: 'EN_PROCESO', replacementId: replacement.id },
      });
      return { replacementId: replacement.id, replacementNumber: replacement.number };
    });
  }

  /**
   * (Auditor) Deshace un reemplazo en borrador: borra el reemplazo enlazado (solo si sigue DRAFT)
   * y devuelve el reporte a PENDIENTE, para poder re-resolverlo (otro reemplazo o merma).
   */
  async cancelReplacement(id: string) {
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      select: { status: true, replacementId: true },
    });
    if (!report) throw new NotFoundException(`Reporte ${id} no encontrado`);
    if (report.status !== 'EN_PROCESO' || !report.replacementId) {
      throw new BadRequestException('El reporte no tiene un reemplazo en curso');
    }
    const rep = await this.prisma.inventoryReplacement.findUnique({
      where: { id: report.replacementId },
      select: { status: true },
    });
    if (rep?.status === 'PROCESSED') {
      throw new BadRequestException('El reemplazo ya fue procesado; no se puede deshacer');
    }
    const replacementId = report.replacementId;
    await this.prisma.$transaction(async (tx) => {
      await tx.damageReport.update({
        where: { id },
        data: { status: 'PENDIENTE', replacementId: null, resolution: null },
      });
      await tx.inventoryReplacementItem.deleteMany({ where: { replacementId } });
      await tx.inventoryReplacement.delete({ where: { id: replacementId } });
    });
    return this.findOne(id);
  }

  /**
   * (Auditor) Procesa el reporte como MERMA: baja pura de stock (ADJUSTMENT_OUT) por cada ítem.
   * Sí toca el kardex. Valida stock suficiente antes.
   */
  async processMerma(id: string, userId: string) {
    await this.assertPendiente(id);
    const report = await this.prisma.damageReport.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { costUsd: true } } } } },
    });
    if (!report) throw new NotFoundException(`Reporte ${id} no encontrado`);
    if (report.items.length === 0) throw new BadRequestException('El reporte no tiene artículos');

    const warehouseId = report.warehouseId;

    // Agregar cantidades por producto (por si un producto aparece en varias líneas) y validar stock.
    const needed = new Map<string, number>();
    for (const it of report.items) {
      needed.set(it.productId, (needed.get(it.productId) || 0) + it.quantity);
    }
    for (const [productId, qty] of needed) {
      const stock = await this.prisma.stock.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
        select: { quantity: true },
      });
      const available = stock?.quantity ?? 0;
      if (available < qty) {
        const name = report.items.find((i) => i.productId === productId)?.productName ?? productId;
        throw new BadRequestException(
          `Stock insuficiente de "${name}": disponible ${available}, requiere ${qty}`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const it of report.items) {
        await tx.stock.update({
          where: { productId_warehouseId: { productId: it.productId, warehouseId } },
          data: { quantity: { decrement: it.quantity } },
        });
        const after = await tx.stock.findUnique({
          where: { productId_warehouseId: { productId: it.productId, warehouseId } },
          select: { quantity: true },
        });
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity: -it.quantity,
            costUsd: it.product.costUsd,
            stockAfter: after?.quantity ?? 0,
            reason: `Merma - reporte de daños ${report.number}`,
            reference: report.number,
            sourceType: 'DAMAGE_REPORT',
            sourceId: report.id,
            createdById: userId,
          },
        });
      }
      return tx.damageReport.update({
        where: { id },
        data: {
          status: 'PROCESADO',
          resolution: 'MERMA',
          processedById: userId,
          processedAt: new Date(),
        },
      });
    });
  }

  async cancel(id: string) {
    await this.assertPendiente(id);
    return this.prisma.damageReport.update({
      where: { id },
      data: { status: 'ANULADO' },
    });
  }
}
