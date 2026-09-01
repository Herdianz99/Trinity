import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class QueryBsMovementsDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsIn(['ENTRADA', 'SALIDA'])
  type?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
