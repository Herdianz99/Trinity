import { IsString, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
  @IsString()
  purchaseOrderItemId: string;

  @IsNumber()
  @Min(0)
  receivedQty: number;

  @IsNumber()
  @Min(0)
  costUsd: number;
}

export class ReceivePurchaseOrderDto {
  @IsString()
  warehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
}
