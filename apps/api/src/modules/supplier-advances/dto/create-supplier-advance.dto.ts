import { IsString, IsNumber, IsOptional, Min, IsDateString } from 'class-validator';

export class CreateSupplierAdvanceDto {
  @IsString()
  supplierId: string;

  @IsNumber()
  @Min(0.01)
  amountUsd: number;

  @IsString()
  methodId: string;

  @IsString()
  cashSessionId: string;

  // Fecha del anticipo (YYYY-MM-DD). Si no se envia, se usa hoy (Caracas).
  @IsOptional()
  @IsDateString()
  date?: string;

  // Tasa editable por el usuario. Si no se envia, se resuelve por la fecha (o hoy).
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
