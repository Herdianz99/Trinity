import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrossSellRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) trigger: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  // Mencionar la medida del producto cotizado ("discos de corte para 4-1/2").
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useMeasure?: boolean;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED']) status?: 'ACTIVE' | 'PAUSED';
}

export class UpdateCrossSellRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) trigger?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  // Mencionar la medida del producto cotizado ("discos de corte para 4-1/2").
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useMeasure?: boolean;
  // DISMISSED = descartar una sugerencia (el analisis no la vuelve a proponer).
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'DISMISSED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'DISMISSED'])
  status?: 'ACTIVE' | 'PAUSED' | 'DISMISSED';
}

export class TestCrossSellRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) trigger: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  // Mencionar la medida del producto cotizado ("discos de corte para 4-1/2").
  @ApiPropertyOptional() @IsOptional() @IsBoolean() useMeasure?: boolean;
}
