import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Crear un articulo pedido manualmente (sin Excel).
export class CreateSupplierOrderItemDto {
  @IsString()
  supplierRef: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  quantityOrdered: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  observation?: string;
}

// Editar campos sueltos de un articulo pedido (observacion, cantidad, etc.).
export class UpdateSupplierOrderItemDto {
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityOrdered?: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  observation?: string;
}

// Marcar recibido manualmente (fuera de una factura de compra).
export class ReceiveSupplierOrderItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityReceived?: number;
}

// Una fila cruda parseada del Excel en el frontend.
export class SupplierOrderRowDto {
  @IsString()
  supplierRef: string;

  @IsString()
  description: string;

  @IsNumber()
  quantityOrdered: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;
}

// Carga masiva desde Excel (preview y confirmacion comparten el mismo payload).
export class UploadSupplierOrderDto {
  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierOrderRowDto)
  rows: SupplierOrderRowDto[];
}
