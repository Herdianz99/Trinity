import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReminderDto {
  // Marcar el recordatorio como enviado ahora (sella lastReminderAt = now).
  @IsOptional()
  @IsBoolean()
  markSent?: boolean;

  // Observación de cobranza (texto libre). '' la borra.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
