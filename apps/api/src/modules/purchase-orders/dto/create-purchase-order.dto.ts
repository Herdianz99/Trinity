import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min, IsBoolean, IsInt, IsIn, IsDateString } from 'class-validator';
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPct?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  supplierSerialNumber?: string;

  @IsOptional()
  @IsString()
  supplierControlNumber?: string;

  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['USD', 'BS'])
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsBoolean()
  isFiscal?: boolean;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountGlobalPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  surchargeUsd?: number;

  @IsOptional()
  @IsString()
  @IsIn(['PROPORTIONAL', 'EQUAL'])
  surchargeDistribution?: string;

  @IsOptional()
  @IsBoolean()
  applyIslr?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  islrRetentionPct?: number;

  @IsOptional()
  @IsString()
  retentionVoucherNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}
