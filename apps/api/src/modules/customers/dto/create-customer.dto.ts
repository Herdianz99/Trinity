import { IsString, IsOptional, IsNumber, IsInt, IsIn, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, enum: ['V', 'E', 'J', 'G', 'C', 'P'], default: 'V' })
  @IsOptional()
  @IsString()
  @IsIn(['V', 'E', 'J', 'G', 'C', 'P'])
  documentType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rif?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;
}
