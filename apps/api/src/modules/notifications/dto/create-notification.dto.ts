import { IsString, IsIn, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TargetDto {
  @IsIn(['INDIVIDUAL', 'MULTIPLE', 'DEPARTMENT', 'ALL'])
  mode: 'INDIVIDUAL' | 'MULTIPLE' | 'DEPARTMENT' | 'ALL';

  @IsOptional() @IsArray() @IsString({ each: true })
  employeeIds?: string[];

  @IsOptional() @IsString()
  departmentId?: string;
}

export class CreateNotificationDto {
  @IsString() title: string;
  @IsString() body: string;
  @IsIn(['INFORMATIVA', 'REUNION', 'AMONESTACION'])
  type: 'INFORMATIVA' | 'REUNION' | 'AMONESTACION';

  @ValidateNested() @Type(() => TargetDto)
  target: TargetDto;
}
