import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'usuario@trinity.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', required: false })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.SELLER })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  restrictToOnSiteIp?: boolean;

  @ApiProperty({ required: false, type: [String], description: 'Modulos extra solo para este usuario, ademas de los de su rol' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraModules?: string[];

  @ApiProperty({ required: false, description: 'Empleado de nomina vinculado (para el portal Mi Perfil)' })
  @IsOptional()
  @IsString()
  employeeId?: string;
}
