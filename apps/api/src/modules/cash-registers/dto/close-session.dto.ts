import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CloseSessionDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  closingBalanceUsd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  closingBalanceBs: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
