import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class CreateSalesBookEntryDto {
  @IsDateString()
  entryDate: string;

  @IsString()
  invoiceNumber: string;

  @IsOptional()
  @IsString()
  controlNumber?: string;

  @IsString()
  customerName: string;

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
