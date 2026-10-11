import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class PreviewSynonymDto {
  @ApiProperty({ example: 'barra resalte' })
  @IsString()
  @MinLength(1)
  matchTerms: string;

  @ApiPropertyOptional({ type: [String], description: 'Vacio = todas las categorias' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}

export class CreateSynonymDto extends PreviewSynonymDto {
  @ApiProperty({ type: [String], example: ['cabilla', 'cabilla estriada'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  terms: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSynonymDto extends PartialType(CreateSynonymDto) {}

export class SetActiveDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids: string[];

  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}
