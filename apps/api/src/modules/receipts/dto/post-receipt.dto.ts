import { IsArray, ValidateNested, IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptPaymentLineDto {
  @IsString()
  methodId: string;

  @IsNumber()
  @Min(0)
  amountUsd: number;

  @IsNumber()
  @Min(0)
  amountBs: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class PostReceiptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentLineDto)
  payments: ReceiptPaymentLineDto[];

  @IsOptional()
  @IsString()
  cashSessionId?: string;
}
