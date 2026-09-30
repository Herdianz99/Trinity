import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BankExportDto {
  @ApiProperty({ type: [String], description: 'IDs de PaymentScheduleItem a pagar hoy' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  itemIds: string[];
}
