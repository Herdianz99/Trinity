import { IsString, IsOptional, IsDateString, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';

export class CreateDisciplinaryActionDto {
  @IsString()
  employeeId: string;

  @IsString()
  faultTypeId: string;

  @IsString()
  @MaxLength(2000)
  reason: string; // motivo / descripción

  // Fecha del suceso en ISO (idealmente con offset -04:00 de Caracas). Si no llega, se usa hoy.
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  // Fotos del acta firmada (data URIs base64). Se procesan a thumb+medium webp. Máximo 8.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  photos?: string[];
}
