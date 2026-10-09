import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

// De dónde sale el dinero del gasto de nómina que se genera al cerrar la corrida.
// Mismas opciones que un gasto manual: caja abierta (+ método), a crédito (CxP) o sin caja.
export class ClosePayrollRunDto {
  @IsOptional()
  @IsString()
  cashSessionId?: string;

  @IsOptional()
  @IsString()
  methodId?: string;

  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsInt()
  creditDays?: number;
}
