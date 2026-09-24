import { IsIn, IsOptional, IsString } from 'class-validator';

export class AckNotificationDto {
  @IsIn(['RECIBIDO', 'RECHAZADO'])
  ackState: 'RECIBIDO' | 'RECHAZADO';

  @IsOptional() @IsString()
  comment?: string;
}
