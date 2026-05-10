import {
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class PaymentItemDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amountUsd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amountBs: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class PayInvoiceDto {
  @ApiProperty({ type: [PaymentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  payments: PaymentItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  creditAuthPassword?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  creditDays?: number;
}
