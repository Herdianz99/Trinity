import { IsString, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LostSaleReason } from '@prisma/client';

export class CreateLostSaleDto {
  @ApiProperty({ required: false, description: 'ID del producto del catalogo (si aplica)' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ required: false, description: 'Nombre del producto (requerido si no es del catalogo)' })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @ApiProperty({ enum: LostSaleReason })
  @IsEnum(LostSaleReason)
  reason: LostSaleReason;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Precio unitario USD (solo para producto de texto libre)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceUsd?: number;
}
