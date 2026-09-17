import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGoodsReceiptItemDto {
  @IsString()
  productId: string;

  // Cantidad recibida en buen estado.
  @IsNumber()
  @Min(0)
  qtyReceived: number;

  // Cantidad devuelta por defecto o daño (opcional).
  @IsOptional()
  @IsNumber()
  @Min(0)
  qtyReturned?: number;

  // Motivo del devuelto (ej. "Defectuoso", "Dañado en transporte").
  @IsOptional()
  @IsString()
  @MaxLength(300)
  returnReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Fotos del renglón devuelto (data URIs base64). Cada una -> thumb+medium webp en Spaces. Máx 6.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photos?: string[];
}

export class CreateGoodsReceiptDto {
  // Proveedor que envió (del catálogo). El nombre se guarda como snapshot en el backend.
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverName?: string; // chofer

  @IsOptional()
  @IsString()
  @MaxLength(20)
  truckPlate?: string; // placa del camión

  // Almacén donde se recibió (opcional; es documental, no mueve stock).
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Fotos generales de la ficha (camión/entrega). Máx 12.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  photos?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptItemDto)
  items: CreateGoodsReceiptItemDto[];
}
