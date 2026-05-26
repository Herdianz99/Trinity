import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSerieDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  prefix: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isFiscal?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVatExempt?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cashRegisterId?: string;
}
