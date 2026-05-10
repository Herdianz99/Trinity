import { IsString, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'NuevaPass1' })
  @IsString()
  @MinLength(8, { message: 'La contrasena debe tener al menos 8 caracteres' })
  @Matches(/[A-Z]/, { message: 'La contrasena debe tener al menos una mayuscula' })
  @Matches(/[0-9]/, { message: 'La contrasena debe tener al menos un numero' })
  newPassword: string;
}
