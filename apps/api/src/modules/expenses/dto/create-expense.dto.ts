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

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
