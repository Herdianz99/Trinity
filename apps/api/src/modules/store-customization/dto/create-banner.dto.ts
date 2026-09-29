import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBannerDto {
  @ApiPropertyOptional({ enum: ['HERO', 'PROMO'], default: 'HERO' })
  @IsOptional()
  @IsIn(['HERO', 'PROMO'])
  placement?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional({ description: 'Etiqueta pequeña sobre el título (ej. "Oferta del mes")' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'A dónde va el botón de acción' })
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'Texto del botón de acción' })
  @IsOptional()
  @IsString()
  linkLabel?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
