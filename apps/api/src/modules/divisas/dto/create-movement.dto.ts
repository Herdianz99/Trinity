import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsPositive,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateMovementDto {
  @IsDateString()
  date: string;

  @IsString()
  companyId: string;

  // (obsoleto) dimension banco retirada del modulo; se acepta opcional por compatibilidad.
  @IsOptional()
  @IsString()
  bankId?: string;

  // 'MOVIMIENTO' (transferencia simple de USD) | 'COMPRA' (compra de divisas con Bs/tasa/comision).
  @IsOptional()
  @IsIn(['MOVIMIENTO', 'COMPRA'])
  kind?: string;

  @IsIn(['ENTRADA', 'SALIDA'])
  type: string;

  @IsNumber()
  @IsPositive()
  amountUsd: number;

  // Bs TOTAL (equivalente + comision); descuenta del saldo Bs de la empresa. Opcional.
  @IsOptional()
  @IsNumber()
  amountBs?: number;

  // Tasa Bs/USD usada (4 decimales). Auto de la tasa del dia, editable. Opcional.
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  // % de comision (0.5 por defecto). Auto, editable. Opcional.
  @IsOptional()
  @IsNumber()
  commissionPct?: number;

  // Banco de origen de los Bs (maestro TreasuryOriginBank). Opcional.
  @IsOptional()
  @IsString()
  originBankId?: string;

  @IsOptional()
  @IsIn(['ELECTRONICO', 'EFECTIVO'])
  modalidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['CONFIRMADO', 'PENDIENTE'])
  status?: string;
}
