import { IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Concepto adicional sobre una factura del comprobante, con base imponible manual en Bs. */
export class AddIslrExtraConceptDto {
  /** Linea (factura) del comprobante a la que pertenece el concepto. */
  @IsString()
  baseLineId: string;

  @IsString()
  islrRetentionTypeId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  taxableBaseBs: number;
}
