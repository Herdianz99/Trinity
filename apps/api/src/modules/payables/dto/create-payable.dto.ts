import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class CreatePayableDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  controlFiscal?: string;

  // Serie alfanumerica de la factura del proveedor (ej. "A")
  @IsOptional()
  @IsString()
  serie?: string;

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

  // Retention (creates RetentionVoucher document)
  @IsOptional()
  @IsBoolean()
  createRetention?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionPct?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
