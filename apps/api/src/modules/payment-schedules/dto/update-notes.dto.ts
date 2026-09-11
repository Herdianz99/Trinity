import { IsOptional, IsString } from 'class-validator';

export class UpdateNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
