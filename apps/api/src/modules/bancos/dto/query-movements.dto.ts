import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryMovementsDto {
  @IsOptional() @IsString() from?: string; // 'YYYY-MM-DD'
  @IsOptional() @IsString() to?: string; // 'YYYY-MM-DD'
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsIn(['all', 'reconciled', 'pending']) status?: string;
}
