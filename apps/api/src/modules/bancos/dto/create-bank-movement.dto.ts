import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateBankMovementDto {
  @IsString() bankAccountId: string;
  @IsString() date: string; // 'YYYY-MM-DD'
  @IsIn(['IN', 'OUT']) direction: string;
  @IsNumber() amount: number; // en la moneda de la cuenta
  @IsOptional() @IsNumber() exchangeRate?: number; // para calcular el equivalente en la otra moneda
  @IsIn(['COMISION', 'IGTF', 'INTERES', 'NOTA_DEBITO', 'NOTA_CREDITO', 'AJUSTE']) type: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
}

// Traspaso entre dos cuentas propias
export class CreateTransferDto {
  @IsString() fromAccountId: string;
  @IsString() toAccountId: string;
  @IsString() date: string;
  @IsNumber() amountFrom: number; // monto que sale (moneda de fromAccount)
  @IsNumber() amountTo: number; // monto que entra (moneda de toAccount)
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() description?: string;
}
