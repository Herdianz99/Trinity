import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWarehouseDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  // false = el stock de este almacen NO cuenta como disponible para la venta (ej: dañados).
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  countsForSale?: boolean;
}
