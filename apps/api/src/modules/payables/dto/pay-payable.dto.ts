import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class PayPayableDto {
  @IsNumber()
  @Min(0.01)
  amountUsd: number;

  @IsString()
  method: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
