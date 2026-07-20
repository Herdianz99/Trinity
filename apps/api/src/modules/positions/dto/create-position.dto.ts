import { IsString, IsOptional, IsNumber, IsBoolean, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePositionDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ default: 0, description: 'Sueldo sugerido al asignar el cargo (USD)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultSalaryUsd?: number;

  @ApiProperty({ default: 0, description: 'Bonificación sugerida al asignar el cargo (USD)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultBonusUsd?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
