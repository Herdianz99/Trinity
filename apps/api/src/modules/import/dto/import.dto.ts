import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
  ValidateNested,
  MinLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IvaType } from '@prisma/client';

// ─── Category ────────────────────────────────────────────────────────

export class ImportCategoryDto {
  @ApiProperty({ example: 'Herramientas' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'HER', description: '3 uppercase letters' })
  @IsString()
  @MinLength(2)
  code: string;

  @ApiProperty({ example: ['Manuales', 'Electricas'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subcategories?: string[];
}

// ─── Brand ───────────────────────────────────────────────────────────

export class ImportBrandDto {
  @ApiProperty({ example: 'Stanley' })
  @IsString()
  @MinLength(1)
  name: string;
}

// ─── Supplier ────────────────────────────────────────────────────────

export class ImportSupplierDto {
  @ApiProperty({ example: 'Distribuidora ABC' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'J-12345678-9', required: false })
  @IsOptional()
  @IsString()
  rif?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactName?: string;
}

// ─── Product ─────────────────────────────────────────────────────────

export class ImportProductDto {
  @ApiProperty({ required: false, example: 'HER00001' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false, example: '7891234567890' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ required: false, example: 'ST-001' })
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @ApiProperty({ example: 'Martillo 16oz Stanley' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Herramientas', description: 'Category name' })
  @IsString()
  category: string;

  @ApiProperty({ required: false, example: 'Manuales', description: 'Subcategory name' })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiProperty({ required: false, example: 'Stanley', description: 'Brand name' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false, example: 'Distribuidora ABC', description: 'Supplier name' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiProperty({ required: false, default: 'UNIT' })
  @IsOptional()
  @IsString()
  purchaseUnit?: string;

  @ApiProperty({ required: false, default: 'UNIT' })
  @IsOptional()
  @IsString()
  saleUnit?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  conversionFactor?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costUsd?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gananciaPct?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gananciaMayorPct?: number;

  @ApiProperty({ required: false, default: 'GENERAL', enum: IvaType })
  @IsOptional()
  @IsEnum(IvaType)
  ivaType?: IvaType;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  bregaApplies?: boolean;
}

// ─── Root payload ────────────────────────────────────────────────────

export class BulkImportDto {
  @ApiProperty({ type: [ImportCategoryDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCategoryDto)
  categories?: ImportCategoryDto[];

  @ApiProperty({ type: [ImportBrandDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportBrandDto)
  brands?: ImportBrandDto[];

  @ApiProperty({ type: [ImportSupplierDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportSupplierDto)
  suppliers?: ImportSupplierDto[];

  @ApiProperty({ type: [ImportProductDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportProductDto)
  products?: ImportProductDto[];
}
