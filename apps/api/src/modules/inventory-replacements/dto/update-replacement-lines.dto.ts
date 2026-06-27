import { IsArray, ValidateNested, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class ReplacementLineUpdateDto {
  @ApiProperty({ description: 'id de la linea (InventoryReplacementItem)' })
  @IsString()
  id: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  outQuantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  inQuantity: number;
}

export class UpdateReplacementLinesDto {
  @ApiProperty({ type: [ReplacementLineUpdateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplacementLineUpdateDto)
  items: ReplacementLineUpdateDto[];
}

export class RemoveReplacementLinesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
}
