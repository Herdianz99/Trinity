import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EditOpeningBalanceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalanceUsd?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingBalanceBs?: number;

  // Clave dinamica (permiso CANCEL_CASH_SESSION, relabelado "Editar fondo de caja").
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  dynamicKey?: string;
}
