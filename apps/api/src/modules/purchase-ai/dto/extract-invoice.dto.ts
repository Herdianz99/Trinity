import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExtractInvoiceDto {
  @ApiProperty({
    description: 'Factura como data URI base64 — imagen (data:image/...) o PDF (data:application/pdf;base64,...)',
  })
  @IsString()
  @Matches(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,/, {
    message: 'El archivo debe ser un data URI base64 de imagen o PDF',
  })
  file: string;

  @ApiPropertyOptional({
    description:
      'Instrucciones en lenguaje natural para la IA (ej: "aplica 10% de descuento global no reflejado", "los precios traen IVA")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiPropertyOptional({ description: 'Proveedor ya seleccionado en el formulario (acota el match de productos)' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Usar el modelo más preciso (más caro) para facturas densas o de baja calidad' })
  @IsOptional()
  @IsBoolean()
  preciseModel?: boolean;
}
