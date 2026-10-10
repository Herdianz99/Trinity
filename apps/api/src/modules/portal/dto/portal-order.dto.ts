import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Sin precio ni descuento: con forbidNonWhitelisted el API rechaza (400) si alguien los manda.
export class PortalOrderItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class PortalOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  portalNote?: string;

  @ApiProperty({ type: [PortalOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe tener al menos un producto' })
  @ValidateNested({ each: true })
  @Type(() => PortalOrderItemDto)
  items: PortalOrderItemDto[];
}
