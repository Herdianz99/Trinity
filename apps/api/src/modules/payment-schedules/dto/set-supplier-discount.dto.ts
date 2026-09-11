import { IsNumber, IsString, Max, Min } from 'class-validator';

export class SetSupplierDiscountDto {
  @IsString()
  supplierName: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct: number;
}
