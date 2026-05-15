import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenSessionDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingBalanceUsd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  openingBalanceBs: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
