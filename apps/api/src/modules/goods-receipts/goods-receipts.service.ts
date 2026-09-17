import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { caracasDateKey } from '../../common/timezone';
import { SpacesService } from '../product-images/spaces.service';
import { processProductImage, dataUriToBuffer } from '../product-images/image-processing';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { QueryGoodsReceiptsDto } from './dto/query-goods-receipts.dto';

// Recepción de mercancía: ficha DOCUMENTAL de lo que recibe el almacén. NO mueve stock ni
// kardex (las compras siguen manejando el inventario). Reusa el patrón de reportes de daños
// para el correlativo (REC-0001) y la subida de fotos a Spaces.
@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly spaces: SpacesService,
  ) {}

  // Convierte las keys de Spaces (fotos generales + fotos por ítem) en URLs de CDN.
  private withPhotoUrls(receipt: any) {
    const mapPhotos = (arr: any[]) =>
      (arr || []).map((p: any) => ({
        id: p.id,
        thumbUrl: this.spaces.cdnUrl(p.thumbKey),
        mediumUrl: this.spaces.cdnUrl(p.mediumKey),
      }));
    return {
      ...receipt,
      photos: mapPhotos(receipt.photos),
      items: (receipt.items || []).map((it: any) => ({ ...it, photos: mapPhotos(it.photos) })),
    };
  }

  private async generateNumber(tx: any): Promise<string> {
    const result = await tx.$queryRaw<{ max: number | null }[]>`
      SELECT MAX(CAST(SPLIT_PART("number", '-', 2) AS INTEGER)) as max FROM (
        SELECT "number" FROM "GoodsReceipt" FOR UPDATE
      ) sub
    `;
    const next = (result[0]?.max || 0) + 1;
    return `REC-${next.toString().padStart(4, '0')}`;
  }

  async create(dto: CreateGoodsReceiptDto, userId: string) {
    if (!dto.items?.length) throw new BadRequestException('La recepción debe tener al menos un artículo');
    for (const it of dto.items) {
      const received = it.qtyReceived || 0;
      const returned = it.qtyReturned || 0;
      if (received <= 0 && returned <= 0) {
        throw new BadRequestException('Cada renglón debe tener cantidad recibida o devuelta mayor a 0');
      }
    }

    // Tope global de fotos (generales + por ítem) para no abusar de Spaces.
    const totalPhotos =
      (dto.photos?.length || 0) + dto.items.reduce((n, it) => n + (it.photos?.length || 0), 0);
    if (totalPhotos > 40) throw new BadRequestException('Máximo 40 fotos por recepción');

    // Proveedor que envió (snapshot del nombre).
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { id: true, name: true },
    });
    if (!supplier) throw new BadRequestException('Proveedor no encontrado');

    // Almacén opcional (es documental). Si se envía, validar que exista.
    let warehouseId: string | null = null;
    if (dto.warehouseId) {
      const wh = await this.prisma.warehouse.findUnique({ where: { id: dto.warehouseId }, select: { id: true } });
      if (!wh) throw new BadRequestException('Almacén no encontrado');
      warehouseId = wh.id;
    }

    // Snapshot de productos.
    const productIds = [...new Set(dto.items.map((it) => it.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, code: true, name: true },
    });
    const prodMap = new Map(products.map((p) => [p.id, p]));
    for (const it of dto.items) {
      if (!prodMap.has(it.productId)) throw new BadRequestException(`Producto ${it.productId} no encontrado`);
    }

    // Subir fotos a Spaces ANTES de crear la fila (patrón daños). Se separan generales y por ítem.
    const date = caracasDateKey(dto.date);
    const allUploaded: { thumbKey: string; mediumKey: string }[] = [];
    const uploadOne = async (photo: string) => {
      let processed;
      try {
        processed = await processProductImage(dataUriToBuffer(photo));
      } catch {
        throw new BadRequestException('Una de las fotos no es una imagen válida');
      }
      const stamp = Date.now().toString(36);
      const rand = Math.random().toString(36).slice(2, 8);
      const thumbKey = `goods-receipts/${stamp}-${rand}-thumb.webp`;
      const mediumKey = `goods-receipts/${stamp}-${rand}-medium.webp`;
      await Promise.all([
        this.spaces.uploadPublic(thumbKey, processed.thumb, 'image/webp'),
        this.spaces.uploadPublic(mediumKey, processed.medium, 'image/webp'),
      ]);
      const rec = { thumbKey, mediumKey };
      allUploaded.push(rec);
      return rec;
    };

    try {
      const generalUploads: { thumbKey: string; mediumKey: string }[] = [];
      for (const photo of dto.photos || []) generalUploads.push(await uploadOne(photo));

      const uploadedByItem: { thumbKey: string; mediumKey: string }[][] = [];
      for (const it of dto.items) {
        const itemUploads: { thumbKey: string; mediumKey: string }[] = [];
        for (const photo of it.photos || []) itemUploads.push(await uploadOne(photo));
        uploadedByItem.push(itemUploads);
      }

      const receipt = await this.prisma.$transaction(async (tx) => {
        const number = await this.generateNumber(tx);
        return tx.goodsReceipt.create({
          data: {
            number,
            date,
            warehouseId,
            supplierId: supplier.id,
            supplierName: supplier.name,
            driverName: dto.driverName?.trim() || null,
            truckPlate: dto.truckPlate?.trim().toUpperCase() || null,
            notes: dto.notes?.trim() || null,
            status: 'REGISTRADO',
            createdById: userId,
            photos: { create: generalUploads },
            items: {
              create: dto.items.map((it, idx) => {
                const p = prodMap.get(it.productId)!;
                return {
                  productId: it.productId,
                  productName: p.name,
                  productCode: p.code,
                  qtyReceived: it.qtyReceived || 0,
                  qtyReturned: it.qtyReturned || 0,
                  returnReason: it.returnReason?.trim() || null,
                  note: it.note?.trim() || null,
                  photos: { create: uploadedByItem[idx] },
                };
              }),
            },
          },
          include: {
            warehouse: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
            photos: true,
            items: { include: { photos: true } },
          },
        });
      });
      return this.withPhotoUrls(receipt);
    } catch (e) {
      await Promise.all(
        allUploaded.flatMap((u) => [this.spaces.delete(u.thumbKey), this.spaces.delete(u.mediumKey)]),
      );
      throw e;
    }
  }

  async findAll(query: QueryGoodsReceiptsDto) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = caracasDateKey(query.from);
      if (query.to) where.date.lte = caracasDateKey(query.to);
    }
    return this.prisma.goodsReceipt.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
  }

  async findOne(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        warehouse: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        photos: true,
        items: { include: { photos: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!receipt) throw new NotFoundException(`Recepción ${id} no encontrada`);
    return this.withPhotoUrls(receipt);
  }

  async cancel(id: string) {
    const receipt = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!receipt) throw new NotFoundException(`Recepción ${id} no encontrada`);
    if (receipt.status !== 'REGISTRADO') {
      throw new BadRequestException('Solo se pueden anular recepciones registradas');
    }
    return this.prisma.goodsReceipt.update({ where: { id }, data: { status: 'ANULADO' } });
  }
}
