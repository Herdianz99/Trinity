import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReplacementDto {
  @ApiProperty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ required: false, description: 'Fecha YYYY-MM-DD (default: hoy)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
