import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, IsDateString } from 'class-validator';

// Editar la cabecera de una corrida (solo en BORRADOR): la fecha de la tasa y/o la tasa.
export class UpdatePayrollRunDto {
  @ApiProperty({ required: false, description: 'Fecha-Caracas de la tasa (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  rateDate?: string;

  @ApiProperty({ required: false, description: 'Tasa de cambio (Bs/$). Editable aunque no exista tasa registrada de ese dia.' })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;
}
