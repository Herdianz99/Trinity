import { IsString, IsOptional, IsInt, Min, Max, IsDateString, MaxLength } from 'class-validator';

export class CreateAudit5SDto {
  @IsString()
  @MaxLength(120)
  zone: string; // zona del patio (combobox con zonas del PDF o texto libre)

  @IsInt()
  @Min(1)
  @Max(5)
  scoreCleanliness: number;

  @IsInt()
  @Min(1)
  @Max(5)
  scoreOrder: number;

  @IsInt()
  @Min(1)
  @Max(5)
  scoreSafety: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  // Fecha del turno YYYY-MM-DD (default: hoy Caracas).
  @IsOptional()
  @IsDateString()
  date?: string;
}
