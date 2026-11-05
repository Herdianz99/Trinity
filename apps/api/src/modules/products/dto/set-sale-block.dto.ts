import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetSaleBlockDto {
  @IsBoolean()
  saleBlocked: boolean;

  // Clave dinamica (permiso TOGGLE_PRODUCT_SALE) requerida para cambiar el estado de venta.
  @IsOptional()
  @IsString()
  dynamicKey?: string;

  // Motivo del bloqueo: obligatorio al bloquear (saleBlocked=true).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
