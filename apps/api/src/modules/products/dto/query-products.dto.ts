import { IsOptional, IsString, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// Lee el valor CRUDO del querystring (obj[key]) y no `value`, porque el ValidationPipe
// corre con enableImplicitConversion: convierte 'false' -> Boolean('false') = true antes
// del Transform, rompiendo el filtro por false. Leyendo el string original se evita eso.
const toBool = ({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
  obj[key] === true || obj[key] === 'true';

export class QueryProductsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowStock?: boolean;

  @ApiProperty({ required: false, description: 'Solo articulos con existencia (suma de stock > 0)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStock?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, description: 'Incluir productos inactivos (solo el catalogo /catalog/products). Por defecto solo activos.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean;

  @ApiProperty({ required: false, description: 'Solo productos bloqueados para la venta (saleBlocked=true).' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  saleBlocked?: boolean;

  @ApiProperty({ required: false, description: 'Solo productos en oferta (isOnSale=true).' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isOnSale?: boolean;

  @ApiProperty({ required: false, description: 'Ordenar productos en oferta de primero (solo el POS lo usa).' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSaleFirst?: boolean;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
