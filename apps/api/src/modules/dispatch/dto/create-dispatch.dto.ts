import { IsString } from 'class-validator';

export class CreateDispatchDto {
  // N° de la factura (el usuario lo teclea). La mercancia debe estar pagada.
  @IsString()
  invoiceNumber: string;
}
