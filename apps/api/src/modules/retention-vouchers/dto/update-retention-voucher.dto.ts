import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRetentionVoucherLineDto {
  @IsString()
  purchaseOrderId: string;

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

export class UpdateRetentionVoucherDto {
  @IsOptional()
  @IsNumber()
  retentionPct?: number;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRetentionVoucherLineDto)
  lines?: UpdateRetentionVoucherLineDto[];
}
