import { IsString, IsArray, IsOptional, MinLength, ArrayMinSize } from 'class-validator';

export class UpdateDynamicKeyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  key?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissions: string[];
}
