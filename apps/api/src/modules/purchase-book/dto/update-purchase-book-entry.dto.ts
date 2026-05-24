import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class UpdatePurchaseBookEntryDto {
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  supplierControlNumber?: string;

  @IsOptional()
  @IsString()
  supplierInvoiceNumber?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  supplierRif?: string;

  @IsOptional()
  @IsNumber()
  exemptAmountBs?: number;

  @IsOptional()
  @IsNumber()
  taxableBaseBs?: number;

  @IsOptional()
  @IsNumber()
  ivaAmountBs?: number;

  @IsOptional()
  @IsString()
  retentionVoucherNumber?: string;

  @IsOptional()
  @IsNumber()
  retentionAmountBs?: number;

  @IsOptional()
  @IsNumber()
  totalBs?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
