import { IsString, IsOptional, IsIn } from 'class-validator';

export class RemoveItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsIn(['SOLD', 'DAMAGED', 'ROTATION', 'OTHER'])
  reason?: 'SOLD' | 'DAMAGED' | 'ROTATION' | 'OTHER';

  @IsOptional()
  @IsString()
  note?: string;
}
