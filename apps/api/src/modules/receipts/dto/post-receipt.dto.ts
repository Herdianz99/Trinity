import { IsArray, ValidateNested, IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptPaymentLineDto {
  @IsString()
  methodId: string;

  @IsNumber()
  @Min(0)
  amountUsd: number;

  @IsNumber()
  @Min(0)
  amountBs: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class PostReceiptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentLineDto)
  payments: ReceiptPaymentLineDto[];

  @IsOptional()
  @IsString()
  cashSessionId?: string;

  // Si los pagos exceden el saldo, registrar el excedente como anticipo (cliente si es cobro,
  // proveedor si es pago). Debe venir en true para permitir el sobrepago; si no, se rechaza.
  @IsOptional()
  @IsBoolean()
  registerExcessAsAdvance?: boolean;
}
