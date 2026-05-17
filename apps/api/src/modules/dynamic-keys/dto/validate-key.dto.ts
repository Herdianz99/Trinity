import { IsString, IsOptional } from 'class-validator';

export class ValidateKeyDto {
  @IsString()
  key: string;

  @IsString()
  permission: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsString()
  action: string;
}
