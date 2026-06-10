import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateIslrRetentionVoucherLineDto {
  @IsString()
  purchaseOrderId: string;

  @IsString()
  islrRetentionTypeId: string;

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

export class UpdateIslrRetentionVoucherDto {
  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateIslrRetentionVoucherLineDto)
  lines?: UpdateIslrRetentionVoucherLineDto[];
}
