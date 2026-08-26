import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryDisciplinaryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  faultTypeId?: string;

  @IsOptional()
  @IsIn(['LLAMADO', 'NOTIFICACION', 'AMONESTACION'])
  level?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
