import { IsOptional, IsString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryProductsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  // String, NO boolean: con enableImplicitConversion un campo boolean convierte el
  // string "false" a `true` (Boolean("false") es truthy), rompiendo el filtro. Se
  // interpreta como string en el service ('true' | 'false').
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  exhibited?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
