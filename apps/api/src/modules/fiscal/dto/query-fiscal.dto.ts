import { IsOptional, IsString } from 'class-validator';

export class QueryFiscalDto {
  @IsString()
  from: string;

  @IsString()
  to: string;
}
