import { IsString, IsOptional, IsBoolean, IsEmail, MinLength, IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ required: false, description: 'Metodo de pago (texto libre): como se le paga al proveedor' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiProperty({ required: false, default: 0, description: 'Dias de credito por defecto del proveedor' })
  @IsOptional()
  @IsInt()
  @Min(0)
  creditDays?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isRetentionAgent?: boolean;

  @ApiProperty({ required: false, enum: SupplierType })
  @IsOptional()
  @IsEnum(SupplierType)
  supplierType?: SupplierType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  islrConceptId?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
