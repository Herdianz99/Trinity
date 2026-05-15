import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isDivisa?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  createsReceivable?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fiscalCode?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  parentId?: string;
}
