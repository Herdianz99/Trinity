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

// Ajuste fiscal del documento (solo factura de compra a CREDITO + FISCAL): permite escribir
// los montos exactos del documento del proveedor (que difieren por centimos de la suma de
// lineas) para alimentar la CxP, el libro de compras y la retencion. El inventario/costo
// sigue saliendo de las lineas. Montos en la moneda de la orden (currency).
export class FiscalAdjustmentDto {
  @IsOptional()
  @IsString()
  currency?: string; // 'USD' | 'BS' (default = moneda de la orden)

  @IsOptional()
  @IsNumber()
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  exemptBase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxableBase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ivaAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  igtfAmount?: number;

  @IsOptional()
  @IsString()
  originalDate?: string; // fecha del documento del proveedor (la que se muestra en el libro)

  @IsOptional()
  @IsString()
  receptionDate?: string; // fecha de recepcion (periodo en que se declara en el libro)

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditDays?: number;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => FiscalAdjustmentDto)
  fiscalAdjustment?: FiscalAdjustmentDto;
}
