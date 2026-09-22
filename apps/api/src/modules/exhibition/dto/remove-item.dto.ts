import { IsString, IsOptional, IsIn, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class RemoveItemDto {
  @IsString()
  productId: string;

  // Unidades a retirar. Si se omite, se retiran TODAS las exhibidas.
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsIn(['SOLD', 'DAMAGED', 'ROTATION', 'OTHER'])
  reason?: 'SOLD' | 'DAMAGED' | 'ROTATION' | 'OTHER';

  @IsOptional()
  @IsString()
  note?: string;
}
