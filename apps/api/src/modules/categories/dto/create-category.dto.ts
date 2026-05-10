import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, description: '3 letras mayusculas, ej: HER' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'El codigo debe tener exactamente 3 letras' })
  @MaxLength(3, { message: 'El codigo debe tener exactamente 3 letras' })
  @Matches(/^[A-Za-z]{3}$/, { message: 'El codigo debe contener solo letras (3)' })
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  printAreaId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
