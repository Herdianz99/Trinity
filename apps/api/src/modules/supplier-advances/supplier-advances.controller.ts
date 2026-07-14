import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupplierAdvancesService } from './supplier-advances.service';
import { CreateSupplierAdvanceDto } from './dto/create-supplier-advance.dto';

@Controller('supplier-advances')
@UseGuards(AuthGuard('jwt'))
export class SupplierAdvancesController {
  constructor(private readonly service: SupplierAdvancesService) {}

  @Post()
  create(
    @Body() dto: CreateSupplierAdvanceDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      supplierId,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('supplier/:supplierId')
  findBySupplier(@Param('supplierId') supplierId: string) {
    return this.service.findBySupplier(supplierId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body('dynamicKey') dynamicKey: string) {
    return this.service.remove(id, dynamicKey);
  }
}
