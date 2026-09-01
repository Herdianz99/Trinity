import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';

export class QueryMovementsDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsIn(['ENTRADA', 'SALIDA'])
  type?: string;

  @IsOptional()
  @IsIn(['MOVIMIENTO', 'COMPRA'])
  kind?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
