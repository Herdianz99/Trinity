import { PartialType } from '@nestjs/swagger';
import { CreatePrintAreaDto } from './create-print-area.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrintAreaDto extends PartialType(CreatePrintAreaDto) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
