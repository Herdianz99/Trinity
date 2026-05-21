import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';

export class CreateCashMovementDto {
  @IsString()
  cashSessionId: string;

  @IsEnum(['INCOME', 'EXPENSE'])
  type: 'INCOME' | 'EXPENSE';

  @IsNumber()
  amount: number;

  @IsEnum(['USD', 'BS'])
  currency: 'USD' | 'BS';

  @IsString()
  reason: string;

  @IsString()
  dynamicKey: string;
}
