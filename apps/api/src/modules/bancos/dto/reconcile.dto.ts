import { IsArray, IsString, IsOptional, IsBoolean } from 'class-validator';

export class ReconcileDto {
  @IsArray() @IsString({ each: true }) movementIds: string[];
  @IsBoolean() reconciled: boolean; // true = conciliar, false = desconciliar
  @IsOptional() @IsString() statementDate?: string; // 'YYYY-MM-DD'
}
