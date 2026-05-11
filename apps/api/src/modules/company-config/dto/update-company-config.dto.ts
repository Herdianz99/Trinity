import { IsString, IsNumber, IsOptional, IsEmail, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCompanyConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rif?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  bregaGlobalPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  defaultGananciaPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  defaultGananciaMayorPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  defaultWarehouseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  quotationValidityDays?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  overdueWarningDays?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  ivaRetentionPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  islrRetentionPct?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isIGTFContributor?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  igtfPct?: number;
}
