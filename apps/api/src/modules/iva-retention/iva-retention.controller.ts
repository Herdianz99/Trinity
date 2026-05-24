import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IvaRetentionService } from './iva-retention.service';

@Controller('iva-retentions')
@UseGuards(AuthGuard('jwt'))
export class IvaRetentionController {
  constructor(private readonly service: IvaRetentionService) {}

  @Get()
  findAll(
    @Query()
    query: {
      supplierId?: string;
      purchaseOrderId?: string;
      from?: string;
      to?: string;
      search?: string;
      applied?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
