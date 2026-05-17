import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class ReceiptItemDto {
  @IsOptional()
  @IsString()
  receivableId?: string;

  @IsOptional()
  @IsString()
  payableId?: string;

  @IsOptional()
  @IsString()
  creditDebitNoteId?: string;

  @IsNumber()
  @IsIn([1, -1])
  sign: number;

  @IsOptional()
  @IsNumber()
  amountUsd?: number;
}

export class CreateReceiptDto {
  @IsIn(['COLLECTION', 'PAYMENT'])
  type: 'COLLECTION' | 'PAYMENT';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  platformName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  itemIds: ReceiptItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
