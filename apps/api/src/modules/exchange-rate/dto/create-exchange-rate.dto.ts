import { IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { ExchangeRateSource } from '@prisma/client';

export class CreateExchangeRateDto {
  @IsNumber()
  @Min(0.01)
  rate: number;

  @IsOptional()
  @IsEnum(ExchangeRateSource)
  source?: ExchangeRateSource;
}
