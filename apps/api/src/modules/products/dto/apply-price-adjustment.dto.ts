import { IsOptional, IsString, IsNumber, IsEnum, ValidateNested, Min } from 'class-validator';
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
