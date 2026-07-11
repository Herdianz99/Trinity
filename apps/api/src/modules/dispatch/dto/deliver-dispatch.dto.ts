import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DeliverLineDto {
  @IsString()
  dispatchItemId: string;

  @IsNumber()
  @Min(0.001)
  qty: number;
}

export class DeliverDispatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverLineDto)
  lines: DeliverLineDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
