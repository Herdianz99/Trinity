import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class CreateReceivableDto {
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  serieId?: string;

  @IsOptional()
  @IsString()
  currency?: string; // 'USD' or 'BS'

  // Tasa del dia editable; si no viene, se usa la tasa registrada de hoy
  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

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

  // Retencion de IVA sufrida (cliente contribuyente especial): crea una linea negativa
  // isRetentionLine en el libro de ventas. El numero del comprobante lo entrega el cliente.
  @IsOptional()
  @IsBoolean()
  createRetention?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionPct?: number;

  // Numero del comprobante de retencion (documento del cliente) que va al libro de ventas.
  @IsOptional()
  @IsString()
  retentionDocNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
