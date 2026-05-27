import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSerieDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  name: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  prefix: string;

  @ApiProperty({ required: false, enum: ['SALES', 'PURCHASES'] })
  @IsOptional()
  @IsIn(['SALES', 'PURCHASES'])
  type?: 'SALES' | 'PURCHASES';

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comPort?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fiscalMachineSerial?: string;
}
