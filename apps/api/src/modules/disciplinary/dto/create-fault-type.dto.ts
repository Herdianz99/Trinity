import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateFaultTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
