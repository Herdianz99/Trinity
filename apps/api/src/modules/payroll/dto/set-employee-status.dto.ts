import { IsString, IsOptional, IsIn, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EMPLOYEE_STATUS_KEYS } from '../employee-status';

export class SetEmployeeStatusDto {
  @ApiProperty({ enum: EMPLOYEE_STATUS_KEYS })
  @IsString()
  @IsIn(EMPLOYEE_STATUS_KEYS)
  status: string;

  @ApiProperty({ required: false, description: 'Desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  statusFrom?: string;

  @ApiProperty({ required: false, description: 'Hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  statusTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  statusNote?: string;
}

export class QueryEmployeesDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() isActive?: string;
  @IsOptional() @IsString() departmentId?: string;
  // Uno o varios estados separados por coma (ej. "VACATION,MEDICAL_LEAVE")
  @IsOptional() @IsString() status?: string;
}
