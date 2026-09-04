import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateObservationsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;
}
