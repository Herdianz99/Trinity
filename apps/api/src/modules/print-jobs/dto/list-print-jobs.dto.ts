import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListPrintJobsDto {
  @ApiPropertyOptional({ description: 'Fecha desde (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha hasta (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Id de la zona/area de impresion' })
  @IsOptional()
  @IsString()
  printAreaId?: string;

  @ApiPropertyOptional({ description: 'Estado: PENDING | PRINTING | PRINTED | FAILED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Numero de factura (busqueda parcial)' })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}
