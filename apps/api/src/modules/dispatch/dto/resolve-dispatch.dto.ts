import { IsString } from 'class-validator';

export class ResolveDispatchDto {
  // N° de la factura a despachar (tecleado o buscado). Debe estar pagada.
  @IsString()
  invoiceNumber: string;
}
