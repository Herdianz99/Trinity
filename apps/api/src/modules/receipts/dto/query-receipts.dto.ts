import { IsOptional, IsString, IsIn, IsNumber } from 'class-validator';

export class QueryReceiptsDto {
  @IsOptional()
  @IsIn(['COLLECTION', 'PAYMENT'])
  type?: 'COLLECTION' | 'PAYMENT';

  @IsOptional()
  @IsIn(['DRAFT', 'POSTED', 'CANCELLED'])
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  // Busqueda libre: N° de recibo y nombre de cliente/proveedor
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
