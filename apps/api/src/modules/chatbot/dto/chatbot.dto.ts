import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CHATBOT_MODELS } from '../chatbot-pricing';

export class UpdateChatbotConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsIn(CHATBOT_MODELS) model?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['low', 'medium', 'high']) effort?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) botName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) greeting?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) addressText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) hoursText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) deliveryText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) paymentText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) partnersText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) extraInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) divisaDiscountPct?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) divisaExceptionCategoryIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) divisaExceptionProductIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10000) monthlyBudgetUsd?: number;
}

export class SendChatbotMessageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @ApiPropertyOptional({ type: [String], description: 'Fotos como data URI (máx. 4)' })
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) images?: string[];
}
