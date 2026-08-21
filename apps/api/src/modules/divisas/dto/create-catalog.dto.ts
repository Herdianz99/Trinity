import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

/** Alta/edición de una Empresa lógica o un Banco/Ubicación del módulo de divisas. */
export class CreateCatalogDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
