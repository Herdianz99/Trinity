import { IsOptional, IsString, IsEnum, IsNumberString } from 'class-validator';

export class QueryReceiptsDto {
  @IsOptional()
  @IsEnum(['COLLECTION', 'PAYMENT'])
  type?: 'COLLECTION' | 'PAYMENT';

  @IsOptional()
  @IsEnum(['DRAFT', 'POSTED', 'CANCELLED'])
  status?: 'DRAFT' | 'POSTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;
}
