import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFiscalPaymentMethodDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  fiscalCode: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDivisa?: boolean;
}
