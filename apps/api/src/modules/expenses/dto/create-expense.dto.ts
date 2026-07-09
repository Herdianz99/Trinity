import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  categoryId: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsNumber()
  amountUsd?: number;

  @IsOptional()
  @IsNumber()
  amountBs?: number;

  // Tasa de cambio del gasto. Editable: por defecto el frontend trae la del dia
  // del gasto, pero se puede sobreescribir (dias sin tasa guardada o gasto hecho
  // con otra tasa). Si no se envia, el backend busca la del dia de la fecha.
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cashSessionId?: string;

  @IsOptional()
  @IsString()
  methodId?: string;
}
