import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class PriceAdjustmentQueryDto {
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
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  costMin?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  costMax?: number;

  // String ('true' | 'false') a proposito: con enableImplicitConversion, un boolean se corrompe
  // (Boolean('false') === true). Se mantiene como string y se interpreta en buildPriceAdjustmentWhere.
  @ApiProperty({ required: false, description: "'true' = solo con brecha, 'false' = solo sin brecha" })
  @IsOptional()
  @IsString()
  bregaApplies?: string;
}
