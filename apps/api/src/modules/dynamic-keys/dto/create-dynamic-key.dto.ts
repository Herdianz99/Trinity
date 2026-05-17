import { IsString, IsArray, MinLength, ArrayMinSize } from 'class-validator';

export class CreateDynamicKeyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(4)
  key: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissions: string[];
}
