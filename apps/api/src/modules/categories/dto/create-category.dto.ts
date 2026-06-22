import { IsString, IsOptional, IsNumber, Min, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, description: '2 a 6 letras mayusculas, ej: HER / ELEC' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El codigo debe tener entre 2 y 6 letras' })
  @MaxLength(6, { message: 'El codigo debe tener entre 2 y 6 letras' })
  @Matches(/^[A-Za-z]{2,6}$/, { message: 'El codigo debe contener solo letras (2 a 6)' })
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printAreaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
