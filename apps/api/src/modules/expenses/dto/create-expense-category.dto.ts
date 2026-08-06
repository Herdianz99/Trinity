import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Fijo (recurrente) o Extraordinario (eventual). Default EXTRAORDINARY si no se envia.
  @IsOptional()
  @IsIn(['FIXED', 'EXTRAORDINARY'])
  expenseType?: string;
}
