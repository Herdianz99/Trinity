import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRolePermissionsDto {
  @ApiProperty({ example: ['dashboard', 'sales', 'quotations'] })
  @IsArray()
  @IsString({ each: true })
  modules: string[];
}
