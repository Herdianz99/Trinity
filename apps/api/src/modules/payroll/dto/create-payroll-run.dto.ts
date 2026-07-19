import { IsString, IsIn, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePayrollRunDto {
  @ApiProperty({ enum: ['WEEKLY', 'BIWEEKLY'] })
  @IsString()
  @IsIn(['WEEKLY', 'BIWEEKLY'])
  type: string;

  @ApiProperty({ description: 'Inicio del período (YYYY-MM-DD)' })
  @IsDateString()
  periodFrom: string;

  @ApiProperty({ description: 'Fin del período (YYYY-MM-DD)' })
  @IsDateString()
  periodTo: string;

  @ApiProperty({ required: false, description: 'Tasa BCV; si se omite se usa la tasa de hoy' })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;
}
