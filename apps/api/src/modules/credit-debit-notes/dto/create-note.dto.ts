import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsOptional()
  @IsString()
  notes?: string;
}
