import { IsOptional, IsString } from 'class-validator';

export class UpdateDispatchDto {
  @IsOptional()
  @IsString()
  scheduledDate?: string; // 'YYYY-MM-DD' — fecha de despacho que indica el cliente

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
