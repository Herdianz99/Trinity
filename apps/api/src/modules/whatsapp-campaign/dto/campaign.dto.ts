import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ListCampaignQueryDto {
  @IsOptional() @IsIn(['cool', 'act', 'all', 'sent', 'bad'])
  tab?: 'cool' | 'act' | 'all' | 'sent' | 'bad';

  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsString() @MaxLength(10)
  base?: string;

  // '1' = solo de oficio, '0' = solo ocasionales
  @IsOptional() @IsIn(['0', '1'])
  oficio?: '0' | '1';

  @IsOptional() @IsIn(['VIP', 'Frecuente', 'Recurrente', 'Ocasional'])
  seg?: string;

  @IsOptional() @IsIn(['0', '1'])
  hideSent?: '0' | '1';

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  page?: number;

  // '1' = recalcular la clasificacion ahora (si no, se usa la de los ultimos 30 min)
  @IsOptional() @IsIn(['0', '1'])
  refresh?: '0' | '1';
}

export class CreateSendDto {
  @IsString()
  customerId: string;

  @IsString() @MaxLength(20)
  template: string;

  @IsOptional() @IsBoolean()
  edited?: boolean;
}

export class ContactFlagDto {
  @IsBoolean()
  value: boolean;
}

export class UpdateTemplateDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  text: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  storeName?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  dailyLimit?: number;
}

export class ResultsQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to: string;

  // Dias despues del envio en los que una compra cuenta como efecto de la campana.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60)
  window?: number;
}

// Respaldo / "Exportar envios" de la pagina local (localStorage), para no perder el historial.
export class ImportLocalDto {
  @IsObject()
  sent: Record<string, any[]>;

  @IsOptional() @IsObject()
  bad?: Record<string, string>;

  @IsOptional() @IsObject()
  replied?: Record<string, string>;

  @IsOptional() @IsObject()
  tpls?: Record<string, string>;

  @IsOptional() @IsObject()
  cfg?: Record<string, any>;

  @IsOptional() @IsString()
  exportado?: string;
}
