import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignUserDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  userId?: string | null;
}
