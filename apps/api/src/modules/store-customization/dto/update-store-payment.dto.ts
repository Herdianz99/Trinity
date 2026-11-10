import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Datos de Pago Movil que la tienda online muestra en el checkout. Vacio = se quita. */
export class UpdateStorePaymentDto {
  @ApiProperty({ required: false, example: 'Banesco 0134' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  pagoMovilBank?: string;

  @ApiProperty({ required: false, example: 'J409907600' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pagoMovilRif?: string;

  @ApiProperty({ required: false, example: '0424-557.35.45' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pagoMovilPhone?: string;
}
