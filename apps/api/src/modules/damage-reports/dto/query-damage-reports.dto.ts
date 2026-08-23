import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryDamageReportsDto {
  @IsOptional()
  @IsIn(['PENDIENTE', 'EN_PROCESO', 'PROCESADO', 'ANULADO'])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  zone?: string;
}
