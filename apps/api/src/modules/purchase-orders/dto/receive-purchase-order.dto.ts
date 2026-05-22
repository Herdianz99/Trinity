import { IsString, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPriceUpdateItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  gananciaPct: number;

  @IsNumber()
  gananciaMayorPct: number;
}

export class ProcessPurchaseBillDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPriceUpdateItemDto)
  priceUpdates?: ProcessPriceUpdateItemDto[];
}
