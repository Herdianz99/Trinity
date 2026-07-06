import { IsOptional, IsBoolean, IsString } from 'class-validator';

export class ProcessAdjustmentDto {
  // Si true: genera CxC (salida) o CxP (entrada) por el costo total del ajuste.
  @IsOptional()
  @IsBoolean()
  generateAccount?: boolean;

  // Entidad a la que se le carga la cuenta (override de la elegida al crear el ajuste).
  // Para salida (CxC) se usa customerId; para entrada (CxP) se usa supplierId.
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  // Fecha de vencimiento de la cuenta (ISO). Si no viene, la cuenta queda sin vencimiento.
  @IsOptional()
  @IsString()
  dueDate?: string;
}
