import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Filtros del "Analisis de compra": productos (por categoria/marca/proveedor) con su
// existencia y el total vendido en un periodo. from/to en formato YYYY-MM-DD (dia Caracas).
export class PurchaseAnalysisDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ description: 'Desde (YYYY-MM-DD)' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'Hasta (YYYY-MM-DD)' })
  @IsString()
  to: string;

  @ApiProperty({ required: false, description: "'true' para listar solo articulos con ventas" })
  @IsOptional()
  @IsString()
  onlyWithSales?: string;
}
