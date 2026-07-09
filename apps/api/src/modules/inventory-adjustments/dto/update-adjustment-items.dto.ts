import { IsArray, ValidateNested, IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class AdjustmentItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  // Costo efectivo editado a mano (reporte + CxC/CxP). Opcional; si no viene, se
  // conserva/usa el costo calculado del producto.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCostUsd?: number;
}

export class UpdateAdjustmentItemsDto {
  @ApiProperty({ type: [AdjustmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  items: AdjustmentItemDto[];
}
