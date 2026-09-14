import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryPayablesDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  // Busqueda libre: nombre de proveedor, N° de documento de la CxP, N° de factura de
  // compra, y correlativos (CXP/... y FC-...)
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  // enableImplicitConversion ya convierte "true"->true (boolean) por el tipo del campo,
  // asi que hay que aceptar AMBOS: el string "true" y el boolean true. Con solo
  // `value === 'true'` quedaba siempre false (true === 'true' es false) y el filtro no corria.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;

  // Proximas a vencer: dueDate entre hoy y hoy+N (no vencidas, no pagadas)
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  dueWithinDays?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
