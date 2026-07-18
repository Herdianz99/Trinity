import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, Min, MinLength, ValidateNested, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Ficha nueva de cliente para el empleado (cuando no se enlaza uno existente).
export class NewEmployeeCustomerDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, enum: ['V', 'E', 'J', 'G', 'C', 'P'], default: 'V' })
  @IsOptional()
  @IsString()
  @IsIn(['V', 'E', 'J', 'G', 'C', 'P'])
  documentType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rif?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateEmployeeDto {
  // Enlazar a una ficha Customer existente...
  @ApiProperty({ required: false, description: 'Id de un Customer existente a enlazar como empleado' })
  @ValidateIf((o) => !o.newCustomer)
  @IsString()
  customerId?: string;

  // ...o crear una ficha nueva.
  @ApiProperty({ required: false, type: NewEmployeeCustomerDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewEmployeeCustomerDto)
  newCustomer?: NewEmployeeCustomerDto;

  @ApiProperty({ description: 'Departamento (ADMINISTRACION, CAJA, VENTAS, ...)' })
  @IsString()
  @MinLength(2)
  department: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  cargo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bank?: string;

  @ApiProperty({ default: 0, description: 'Sueldo base del período, en USD' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryBaseUsd?: number;

  @ApiProperty({ enum: ['WEEKLY', 'BIWEEKLY'], default: 'WEEKLY' })
  @IsOptional()
  @IsString()
  @IsIn(['WEEKLY', 'BIWEEKLY'])
  frequency?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
