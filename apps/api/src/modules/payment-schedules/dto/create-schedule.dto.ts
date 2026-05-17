import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsNumber()
  budgetUsd?: number;

  @IsOptional()
  @IsNumber()
  budgetBs?: number;

  @IsOptional()
  @IsString()
  budgetCurrency?: string; // "USD" | "Bs"

  @IsOptional()
  @IsString()
  notes?: string;
}
