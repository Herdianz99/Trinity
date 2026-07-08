import { IsOptional, IsString } from 'class-validator';

export class UpdateOnlineOrderDto {
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
