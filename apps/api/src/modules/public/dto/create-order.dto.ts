import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  IsNumber,
  Min,
  ArrayNotEmpty,
} from 'class-validator';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  phone: string; // obligatorio (regla del POS)

  @IsOptional()
  @IsString()
  cedula?: string;

  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryMethod: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
