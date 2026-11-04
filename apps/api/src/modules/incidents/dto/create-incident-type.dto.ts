import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateIncidentTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Departamento del tipo. Opcional si el usuario pertenece a un solo departamento.
  @IsOptional()
  @IsString()
  departmentId?: string;
}
