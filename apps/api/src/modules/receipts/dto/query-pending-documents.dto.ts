import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QueryPendingDocumentsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  platformName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIn(['COLLECTION', 'PAYMENT'])
  type?: 'COLLECTION' | 'PAYMENT';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entityId?: string;
}
