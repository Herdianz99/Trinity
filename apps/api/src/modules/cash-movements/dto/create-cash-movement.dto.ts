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

  // Metodo de pago elegido por el cajero. Si viene, se deriva de el la moneda
  // (divisa->USD, resto->Bs) y si afecta la gaveta (isCash). Opcional por compatibilidad.
  @IsOptional()
  @IsString()
  methodId?: string;

  @IsString()
  dynamicKey: string;
}
