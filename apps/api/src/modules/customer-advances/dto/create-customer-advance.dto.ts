import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateCustomerAdvanceDto {
  @IsString()
  customerId: string;

  @IsNumber()
  @Min(0.01)
  amountUsd: number;

  @IsString()
  methodId: string;

  @IsString()
  cashSessionId: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
