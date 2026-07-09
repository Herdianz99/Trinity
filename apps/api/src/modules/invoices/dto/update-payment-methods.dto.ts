import { IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class PaymentMethodEditDto {
  @ApiProperty()
  @IsString()
  paymentId: string;

  @ApiProperty()
  @IsString()
  methodId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class UpdatePaymentMethodsDto {
  @ApiProperty({ type: [PaymentMethodEditDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodEditDto)
  payments: PaymentMethodEditDto[];
}
