import { IsBoolean, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePortalAccessDto {
  @ApiProperty()
  @IsEmail({}, { message: 'El correo no es valido' })
  email: string;
}

export class UpdatePortalAccessDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  resetPassword?: boolean;
}
