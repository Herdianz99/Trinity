import { IsOptional, IsString, IsNumber, IsEnum, ValidateNested, Min, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PriceAdjustmentFiltersDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subcategoryId?: string;

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
  @IsNumber()
  @Min(0)
  costMin?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  costMax?: number;
}

export class ApplyPriceAdjustmentDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => PriceAdjustmentFiltersDto)
  filters: PriceAdjustmentFiltersDto;

  @ApiProperty({ required: false, type: [String], description: 'IDs de productos a ajustar. Si viene, se ajustan solo esos (ignora los filtros para seleccionar).' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiProperty({ enum: ['REPLACE', 'ADD'] })
  @IsEnum(['REPLACE', 'ADD'])
  adjustmentType: 'REPLACE' | 'ADD';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  gananciaPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  gananciaMayorPct?: number;
}
