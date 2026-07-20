import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Edición de empleado: solo campos propios del empleado (la identidad se edita en la ficha Customer).
export class UpdateEmployeeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bank?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryBaseUsd?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bonusUsd?: number;

  @ApiProperty({ required: false, enum: ['WEEKLY', 'BIWEEKLY'] })
  @IsOptional()
  @IsString()
  @IsIn(['WEEKLY', 'BIWEEKLY'])
  frequency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
