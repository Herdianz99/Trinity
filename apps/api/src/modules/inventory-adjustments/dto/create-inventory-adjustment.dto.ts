import { IsString, IsOptional, IsEnum, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ enum: AdjustmentType })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  // Costo que usara el reporte: 'COST' (costo puro) o 'BREGA' (costo + brecha global). Default 'BREGA'.
  @ApiProperty({ required: false, enum: ['COST', 'BREGA'] })
  @IsOptional()
  @IsIn(['COST', 'BREGA'])
  costMode?: 'COST' | 'BREGA';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierId?: string;
}
