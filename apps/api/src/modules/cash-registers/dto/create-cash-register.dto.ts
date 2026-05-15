import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCashRegisterDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isFiscal?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comPort?: string;
}
