import { IsString, IsOptional } from 'class-validator';

export class PlaceItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  location?: string;
}
