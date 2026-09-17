import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryGoodsReceiptsDto {
  @IsOptional()
  @IsIn(['REGISTRADO', 'ANULADO'])
  status?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
