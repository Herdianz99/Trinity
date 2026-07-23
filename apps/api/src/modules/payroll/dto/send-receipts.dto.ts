import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendReceiptsDto {
  @ApiProperty({ required: false, default: true, description: 'Incluir horas extra / bonificación en el recibo enviado' })
  @IsOptional()
  @IsBoolean()
  includeOvertime?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'Si se indica, solo se envían estas líneas (reenvío puntual). Si se omite, se envían todas.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lineIds?: string[];
}
