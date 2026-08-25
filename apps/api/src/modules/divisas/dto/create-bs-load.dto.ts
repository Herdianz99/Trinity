import { IsString, IsOptional, IsNumber, IsPositive, IsDateString, MaxLength } from 'class-validator';

/** Carga (recarga) de Bs a una empresa del módulo de divisas. */
export class CreateBsLoadDto {
  @IsString()
  companyId: string;

  @IsNumber()
  @IsPositive()
  amountBs: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
