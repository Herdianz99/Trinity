import { IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddReplacementLineDto {
  @ApiProperty({ description: 'Articulo que SALE' })
  @IsString()
  outProductId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  outQuantity: number;

  @ApiProperty({ description: 'Articulo que ENTRA' })
  @IsString()
  inProductId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  inQuantity: number;
}
