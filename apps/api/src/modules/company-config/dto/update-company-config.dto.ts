import { IsString, IsNumber, IsOptional, IsEmail, IsBoolean, ValidateIf, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCompanyConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  companyName?: string;

  // Lista blanca de IP/CIDR del local para el IP-lock ("acceso solo en sitio").
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  allowedIps?: string;

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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  // Opt-in: si true, el POS avisa al elegir un cliente sin direccion (patron del telefono).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requireCustomerAddress?: boolean;

  // Interruptor del libro mayor de caja (arqueo lee del CashLedgerEntry). Reversa instantánea.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useCashLedger?: boolean;

  // Opt-in: habilita la pantalla de despacho verificado por escaneo (/dispatch/scan).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useScanDispatch?: boolean;

  // Opt-in: habilita el Módulo de Almacén (Auditoría 5S + Reporte de daños). Solo aceros/acerosmayor.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useAlmacenOps?: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  defaultCustomerId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  logo?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  stampImage?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  retentionProvidencia?: string;

  // Proximo correlativo (consecutivo) del comprobante de retencion. Permite continuar la
  // numeracion del sistema anterior. El numero final es YYYYMM + este consecutivo (8 digitos).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionNextNumber?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  islrRetentionNextNumber?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  unidadTributaria?: number;

  // Traslados entre empresas socias: si false, no se generan CxC/CxP (solo se mueve mercancia).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  partnerTransferCreatesAccounts?: boolean;

  // Cliente al que se le genera la CxC (empresa que envia). null = caer al socio por nombre.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  partnerTransferCustomerId?: string | null;

  // Proveedor al que se le genera la CxP (empresa que recibe). null = caer al socio por nombre.
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  partnerTransferSupplierId?: string | null;
}
