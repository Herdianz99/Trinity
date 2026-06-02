import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateReceivableDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  currency?: string; // 'USD' or 'BS'

  @IsOptional()
  @IsString()
  originalDate?: string;

  @IsOptional()
  @IsString()
  receptionDate?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string; // CONTADO, CREDITO_15, CREDITO_30, CREDITO_60, CREDITO_90

  @IsOptional()
  @IsString()
  dueDate?: string;

  // Fiscal breakdown (in the input currency)
  @IsOptional()
  @IsNumber()
  @Min(0)
  exemptBase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxableBase8?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxableBase16?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxableBase31?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  igtfPct?: number;

  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
