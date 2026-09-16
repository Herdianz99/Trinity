import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class SetItemDiscountDto {
  // Descuento % del documento. null = quitar el override (vuelve a heredar el del proveedor);
  // un valor entre 0 y 100 = override explícito para este documento.
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPct: number | null;
}
