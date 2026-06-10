import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateIslrTypeDto {
  @IsNumber()
  codigo: number;

  @IsString()
  descripcion: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  baseImponiblePct?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  retentionPct: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sustraendoUt?: number;

  @IsOptional()
  @IsBoolean()
  forPersonaJuridica?: boolean;

  @IsOptional()
  @IsBoolean()
  forPersonaResidente?: boolean;
}
