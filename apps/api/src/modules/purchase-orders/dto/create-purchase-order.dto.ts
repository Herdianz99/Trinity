import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, IsBoolean, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePurchaseOrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  costUsd: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsString()
  supplierControlNumber?: string;

  @IsOptional()
  @IsBoolean()
  applyIslr?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  islrRetentionPct?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
