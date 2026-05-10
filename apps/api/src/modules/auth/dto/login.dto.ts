import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@trinity.com' })
  @IsEmail({}, { message: 'El correo electronico no es valido' })
  email: string;

  @ApiProperty({ example: 'Admin1234!' })
  @IsString({ message: 'La contrasena debe ser texto' })
  @MinLength(6, { message: 'La contrasena debe tener al menos 6 caracteres' })
  password: string;
}
