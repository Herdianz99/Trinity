import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsPositive,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateBsMovementDto {
  @IsDateString()
  date: string;

  @IsString()
  companyId: string;

  @IsIn(['ENTRADA', 'SALIDA'])
  type: string;

  @IsNumber()
  @IsPositive()
  amountBs: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  counterparty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['CONFIRMADO', 'PENDIENTE'])
  status?: string;
}
