import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCashRegisterDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  // Caja de administración: false = NO aparece en el POS (pagos de proveedores/gastos).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  showInPos?: boolean;

  // Contar esta caja en el "Resumen de Caja" del dashboard gerencial (false para la
  // caja de administración / caja chica).
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  includeInDashboard?: boolean;
}
