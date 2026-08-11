import { IsString, IsOptional, IsIn, IsDateString, MaxLength } from 'class-validator';

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

  // Foto opcional (una sola) como data URI base64 ("data:image/jpeg;base64,...").
  // Se procesa a thumb+medium webp y se sube a Spaces al crear.
  @IsOptional()
  @IsString()
  photo?: string;
}
