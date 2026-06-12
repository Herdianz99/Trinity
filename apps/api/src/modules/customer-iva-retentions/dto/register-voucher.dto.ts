import { IsString, IsOptional, IsNumber, Min, Matches } from 'class-validator';

export class RegisterVoucherDto {
  @IsString()
  @Matches(/^\d{14}$/, { message: 'El número de comprobante debe tener 14 dígitos (AAAAMM + 8 dígitos)' })
  voucherNumber: string;

  @IsString()
  voucherDate: string;

  // Permite ajustar el monto al del comprobante físico (tolerancia ±1 Bs)
  @IsOptional()
  @IsNumber()
  @Min(0)
  retentionBs?: number;
}
