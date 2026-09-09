import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SetSaleBlockDto {
  @IsBoolean()
  saleBlocked: boolean;

  // Clave dinamica (permiso TOGGLE_PRODUCT_SALE) requerida para cambiar el estado de venta.
  @IsOptional()
  @IsString()
  dynamicKey?: string;
}
