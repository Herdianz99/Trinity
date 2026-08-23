import { IsOptional, IsString, IsDateString } from 'class-validator';

export class QueryAudit5SDto {
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
