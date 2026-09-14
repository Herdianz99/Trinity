import { IsOptional, IsString, IsIn, IsDateString } from 'class-validator';

export class QueryActivityDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['PLACED', 'REMOVED'])
  action?: 'PLACED' | 'REMOVED';

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;
}
