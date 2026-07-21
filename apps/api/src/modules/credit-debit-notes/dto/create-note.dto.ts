import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  IsEnum,
  IsDateString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesReturnReason } from '@prisma/client';

class NoteItemDto {
  @IsString()
  invoiceItemId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class CreateNoteDto {
  @IsIn(['NCV', 'NDV', 'NCC', 'NDC'])
  type: string;

  @IsIn(['MERCHANDISE', 'MANUAL'])
  origin: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  cashRegisterId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NoteItemDto)
  items?: NoteItemDto[];

  @IsOptional()
  @IsNumber()
  manualAmountUsd?: number;

  @IsOptional()
  @IsNumber()
  manualPct?: number;

  // Motivo de la devolución de ventas — obligatorio para NCV (se valida en el servicio)
  @IsOptional()
  @IsEnum(SalesReturnReason)
  motivo?: SalesReturnReason;

  @IsOptional()
  @IsString()
  notes?: string;

  // Fecha del documento (editable). Si no viene, se usa la fecha de hoy.
  @IsOptional()
  @IsDateString()
  date?: string;

  // N° de la nota que entrega el proveedor (NCC/NDC de compra)
  @IsOptional()
  @IsString()
  supplierDocNumber?: string;
}
