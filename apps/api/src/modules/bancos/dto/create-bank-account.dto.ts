import { IsString, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class CreateBankAccountDto {
  @IsString() name: string;
  @IsString() bankName: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsIn(['CORRIENTE', 'AHORRO', 'CUSTODIA', 'ZELLE', 'OTRO']) accountType: string;
  @IsIn(['VES', 'USD']) currency: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsNumber() exchangeRate?: number; // tasa para calcular equivalentes del saldo inicial
  @IsOptional() @IsString() openingDate?: string; // 'YYYY-MM-DD'
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
