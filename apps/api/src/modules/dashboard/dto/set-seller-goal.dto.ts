import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetSellerGoalDto {
  @ApiProperty({ description: 'Meta mensual del vendedor en USD' })
  @IsNumber()
  @Min(0)
  monthlyGoalUsd: number;
}
