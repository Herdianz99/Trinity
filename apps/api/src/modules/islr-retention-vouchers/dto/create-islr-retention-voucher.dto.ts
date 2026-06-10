import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIslrRetentionVoucherLineDto {
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

export class CreateIslrRetentionVoucherDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateIslrRetentionVoucherLineDto)
  lines: CreateIslrRetentionVoucherLineDto[];
}
