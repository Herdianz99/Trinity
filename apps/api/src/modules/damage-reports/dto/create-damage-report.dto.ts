import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsDateString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDamageReportItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string; // el porqué del daño

  // Fotos de evidencia (data URIs base64). Cada una -> thumb+medium webp en Spaces. Máx 6 por ítem.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photos?: string[];
}

export class CreateDamageReportDto {
  @IsString()
  @MaxLength(120)
  zone: string;

  // Almacén de inventario donde vive el stock. Si no se envía, se usa config.defaultWarehouseId.
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateDamageReportItemDto)
  items: CreateDamageReportItemDto[];
}
