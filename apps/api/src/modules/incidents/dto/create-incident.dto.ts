import { IsString, IsOptional, IsIn, IsDateString, MaxLength, IsArray, ArrayMaxSize } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  typeId: string;

  @IsString()
  @MaxLength(2000)
  description: string; // la observación

  @IsOptional()
  @IsString()
  @MaxLength(200)
  involvedName?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  severity?: string;

  // Fecha+hora del suceso en ISO (idealmente con offset -04:00 de Caracas). Si no se
  // envía, se usa el momento actual.
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  // Fotos opcionales (varias) como data URIs base64 ("data:image/jpeg;base64,...").
  // Cada una se procesa a thumb+medium webp y se sube a Spaces al crear. Máximo 8.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  photos?: string[];

  // LEGACY: foto única. Se mantiene por compatibilidad; si llega, se trata como 1 foto.
  @IsOptional()
  @IsString()
  photo?: string;
}
