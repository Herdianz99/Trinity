import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, MinLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IvaType } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierId?: string;

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

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  bregaApplies?: boolean;

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
  isActive?: boolean;
}
