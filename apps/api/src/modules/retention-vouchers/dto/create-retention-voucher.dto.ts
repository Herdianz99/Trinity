import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRetentionVoucherLineDto {
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  payableId?: string;

  @IsOptional()
  @IsNumber()
  retentionPct?: number;

  @IsOptional()
  @IsBoolean()
  isManual?: boolean;

  @IsOptional()
  @IsNumber()
  retentionAmountUsd?: number;

  @IsOptional()
  @IsNumber()
  retentionAmountBs?: number;
}

export class CreateRetentionVoucherDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsNumber()
  retentionPct?: number;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRetentionVoucherLineDto)
  lines: CreateRetentionVoucherLineDto[];
}
