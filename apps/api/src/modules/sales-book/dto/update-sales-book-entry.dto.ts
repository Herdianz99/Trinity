import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class UpdateSalesBookEntryDto {
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  controlNumber?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerRif?: string;

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
  @IsNumber()
  igtfAmountBs?: number;

  @IsOptional()
  @IsNumber()
  totalBs?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
