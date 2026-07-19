import { IsOptional, IsNumber, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Parámetros globales de nómina (singleton). Todos opcionales: se actualiza lo que venga.
export class UpdatePayrollParamDto {
  @ApiProperty({ required: false, description: 'Monto fijo IVSS por período (Bs)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ivssBs?: number;

  @ApiProperty({ required: false, description: 'Monto fijo FAOV por período (Bs)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  faovBs?: number;

  @ApiProperty({ required: false, description: 'Monto fijo INCES por período (Bs)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  incesBs?: number;

  @ApiProperty({ required: false, description: 'Recargo hora extra diurna (ej. 1.5)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  otDayFactor?: number;

  @ApiProperty({ required: false, description: 'Recargo adicional nocturna sobre la diurna (ej. 1.3)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  otNightFactor?: number;

  @ApiProperty({ required: false, description: 'Base días/mes (ej. 30)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  monthDays?: number;

  @ApiProperty({ required: false, description: 'Horas por semana (ej. 40)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyHours?: number;
}
