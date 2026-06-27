import {
  IsArray,
  ValidateNested,
  IsString,
  IsInt,
  Min,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class LabelItemDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Cantidad de etiquetas de este producto' })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class GenerateLabelsDto {
  @ApiProperty({ type: [LabelItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelItemDto)
  items: LabelItemDto[];

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
