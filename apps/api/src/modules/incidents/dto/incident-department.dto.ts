import { IsString, IsOptional, IsBoolean, IsArray, MaxLength } from 'class-validator';

export class IncidentDepartmentDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Roles cuyos usuarios son miembros automaticamente (ej. ['AUDITOR'])
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  // Departamentos que TAMBIEN pueden ver las incidencias de este (solo lectura)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  viewerDepartmentIds?: string[];

  // Usuarios asignados a mano (User.incidentDepartmentId). Reemplaza la lista completa.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberIds?: string[];
}
