import {
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PaymentItemDto {
  @ApiProperty()
  @IsString()
  methodId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amountUsd: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amountBs: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class PayInvoiceDto {
  @ApiProperty({ type: [PaymentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentItemDto)
  payments: PaymentItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isCredit?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  creditDays?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  changeMethodId?: string;

  // Caja donde el cajero esta cobrando (la activa en su pantalla al procesar).
  // Tiene prioridad sobre la caja con que se creo la factura en espera.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cashRegisterId?: string;

  // El POS marca esto cuando alguna linea sin stock fue autorizada por un supervisor
  // (clave dinamica SELL_NEGATIVE_STOCK validada al agregar el producto). Permite que el
  // backend deje pasar la venta en negativo aunque "Permitir ventas sin stock" este apagado.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  negativeStockAuthorized?: boolean;

  // El POS marca esto cuando un supervisor autorizo (clave dinamica OVERRIDE_CREDIT_BLOCK)
  // una venta a credito pese a que el cliente excede su cupo y/o tiene facturas vencidas.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  overrideCreditBlockAuthorized?: boolean;
}
