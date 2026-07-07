import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetBarcodeDto {
  @ApiProperty({ description: 'Código de barras a asignar al producto' })
  @IsString()
  @IsNotEmpty()
  barcode: string;
}
