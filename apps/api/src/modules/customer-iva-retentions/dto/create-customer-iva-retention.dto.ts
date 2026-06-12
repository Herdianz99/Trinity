import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateCustomerIvaRetentionDto {
  @IsString()
  invoiceId: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  retentionPct?: number;

  // Monto en Bs ajustado (tolerancia ±1 Bs vs cálculo teórico)
  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionBs?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  // Datos del comprobante (caso reintegro: se registra todo de una vez)
  @IsOptional()
  @IsString()
  voucherNumber?: string;

  @IsOptional()
  @IsString()
  voucherDate?: string;
}
