import { IsString, IsOptional, IsNumber, IsInt, IsIn, IsBoolean, Min, Max, MinLength } from 'class-validator';
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

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isSpecialTaxpayer?: boolean;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isGroupCompany?: boolean;

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isEmployee?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  creditAuthorizedBy?: string;

  // Monto minimo (USD) para guardar un pedido desde el portal. 0 = sin minimo.
  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderUsd?: number;

  // Ubicacion GPS para despachos. null en ambas = quitar la ubicacion.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  locationAccuracyM?: number | null;

  // Vendedor asignado (los pedidos del portal llevan este vendedor). null = sin vendedor.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  sellerId?: string | null;
}
