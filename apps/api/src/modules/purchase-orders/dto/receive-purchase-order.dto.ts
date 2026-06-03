import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ProcessPriceUpdateItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  gananciaPct: number;

  @IsNumber()
  gananciaMayorPct: number;
}

export class ProcessPaymentLineDto {
  @IsString()
  methodId: string;

  @IsNumber()
  @Min(0.01)
  amountUsd: number;

  @IsNumber()
  @Min(0)
  amountBs: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class ProcessPurchaseBillDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPriceUpdateItemDto)
  priceUpdates?: ProcessPriceUpdateItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessPaymentLineDto)
  payments?: ProcessPaymentLineDto[];
}
