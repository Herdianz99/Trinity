import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateSupplierAdvanceDto {
  @IsString()
  supplierId: string;

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
