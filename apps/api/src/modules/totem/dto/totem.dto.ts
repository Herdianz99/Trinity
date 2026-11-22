import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateTotemConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) @Max(3600) idleSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showCallToAction?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() introMediaId?: string | null;
}

export class CreateTotemAdDto {
  @ApiProperty({ enum: ['IMAGE', 'VIDEO', 'PRODUCT'] }) @IsIn(['IMAGE', 'VIDEO', 'PRODUCT']) type!: 'IMAGE' | 'VIDEO' | 'PRODUCT';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() mediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() productId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(YMD) startDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(YMD) endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(120) durationSec?: number;
}

export class UpdateTotemAdDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() mediaId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() productId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(YMD) startDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(YMD) endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(120) durationSec?: number;
}

export class ReorderTotemAdsDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) ids!: string[];
}

export class StartTotemUploadDto {
  @ApiProperty() @IsString() @MaxLength(200) fileName!: string;
  @ApiProperty() @IsString() @MaxLength(100) mimeType!: string;
  @ApiProperty() @IsInt() @Min(1) size!: number;
}

export class TotemUploadChunkDto {
  @ApiProperty() @IsInt() @Min(0) index!: number;
  // Pedazo del archivo en base64 (max ~5 MB de archivo -> ~6,7 MB de texto, bajo el limite de 15 MB del API).
  @ApiProperty() @IsString() @MaxLength(8_000_000) data!: string;
}

export class DeleteTotemMediaDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) ids!: string[];
}

export class TotemSendMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) text?: string;
}

// Diagnóstico invisible del totem (reproducción de video). Solo se registra en el log del API.
export class TotemDiagnosticDto {
  @ApiProperty() @IsString() @MaxLength(40) event!: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() data?: Record<string, unknown>;
}

// Síntesis de voz natural (Gemini TTS) para las respuestas de Clover.
export class TotemTtsDto {
  @ApiProperty() @IsString() @MaxLength(800) text!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) voice?: string;
}
