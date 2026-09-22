import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class PlaceItemDto {
  @IsString()
  productId: string;

  // Unidades a poner en vitrina (se SUMAN a las ya exhibidas). Default 1.
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  location?: string;
}
