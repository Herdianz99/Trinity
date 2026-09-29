import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadLogoDto {
  @ApiProperty({ description: 'Logo como data URI base64 (data:image/...;base64,....)' })
  @IsString()
  @Matches(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, { message: 'El logo debe ser un data URI base64' })
  image: string;
}
