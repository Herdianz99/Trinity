import {
  IsArray,
  ValidateNested,
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsNumber,
  IsBoolean,
  MaxLength,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class BoxGroupDto {
  @ApiProperty({ description: 'Contenido de la caja (ej. "TUBO PVC 1/2 - 24 UND")', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  content?: string;

  @ApiProperty({ description: 'Cuantas cajas llevan este contenido' })
  @IsInt()
  @Min(1)
  @Max(500)
  count: number;
}

// Etiquetas de despacho por caja: marcan a que cliente va cada caja en el camion.
export class GenerateBoxLabelsDto {
  @ApiProperty({ description: 'Cliente destino (lo mas grande de la etiqueta)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  customerName: string;

  @ApiProperty({ required: false, description: 'RIF/CI ya formateado (ej. J-12345678-9)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerRif?: string;

  @ApiProperty({ required: false, description: 'Direccion / destino' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiProperty({ required: false, description: 'Referencia (ej. N° de factura)' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @ApiProperty({ required: false, description: 'Fecha ya formateada por el frontend (hora local Caracas)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  date?: string;

  @ApiProperty({ required: false, description: 'Numerar "CAJA n DE N" (default true)' })
  @IsOptional()
  @IsBoolean()
  numbered?: boolean;

  @ApiProperty({ required: false, description: 'Vista previa: solo la 1ra etiqueta (con la numeracion real)' })
  @IsOptional()
  @IsBoolean()
  previewOnly?: boolean;

  @ApiProperty({ type: [BoxGroupDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BoxGroupDto)
  boxes: BoxGroupDto[];

  @ApiProperty({ required: false, description: 'Ancho de la etiqueta en mm (default 57)' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  widthMm?: number;

  @ApiProperty({ required: false, description: 'Alto de la etiqueta en mm (default 40)' })
  @IsOptional()
  @IsNumber()
  @Min(10)
  heightMm?: number;
}
