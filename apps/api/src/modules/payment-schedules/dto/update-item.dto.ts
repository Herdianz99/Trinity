import { IsNumber } from 'class-validator';

export class UpdateItemDto {
  @IsNumber()
  plannedAmountUsd: number;
}
