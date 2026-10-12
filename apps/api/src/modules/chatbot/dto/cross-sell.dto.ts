import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrossSellRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) trigger: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED'] }) @IsOptional() @IsIn(['ACTIVE', 'PAUSED']) status?: 'ACTIVE' | 'PAUSED';
}

export class UpdateCrossSellRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) trigger?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2)
  @IsString({ each: true }) @MinLength(2, { each: true }) @MaxLength(60, { each: true }) offerTerms?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsString({ each: true }) @MaxLength(60, { each: true }) excludeTerms?: string[];
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
}
