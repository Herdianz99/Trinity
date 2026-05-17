import { IsString, IsOptional, IsNumber } from 'class-validator';

export class AddItemDto {
  @IsOptional()
  @IsString()
  payableId?: string;

  @IsOptional()
  @IsString()
  creditDebitNoteId?: string;

  @IsNumber()
  plannedAmountUsd: number;
}
