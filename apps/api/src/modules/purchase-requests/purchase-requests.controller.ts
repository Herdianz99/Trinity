import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseRequestsService } from './purchase-requests.service';
import {
  CreateSupplierOrderItemDto,
  UpdateSupplierOrderItemDto,
  ReceiveSupplierOrderItemDto,
  UploadSupplierOrderDto,
} from './dto/purchase-request.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

// Ver la lista: cualquiera con el modulo 'pedidos' (incluye vendedores, solo lectura).
// Editar (crear, cargar, marcar, borrar): solo compras/supervision/admin via @Roles.
@Controller('purchase-requests')
@UseGuards(AuthGuard('jwt'), ModuleGuard, RolesGuard)
@RequireModule('pedidos')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}

  @Get()
  findAll(
    @Query('status') status?: 'PENDING' | 'RECEIVED' | 'ALL',
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      status: status || 'ALL',
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Post()
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  create(@Body() dto: CreateSupplierOrderItemDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Post('upload/preview')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  uploadPreview(@Body() dto: UploadSupplierOrderDto) {
    return this.service.uploadPreview(dto);
  }

  @Post('upload/confirm')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  uploadConfirm(@Body() dto: UploadSupplierOrderDto, @CurrentUser('id') userId: string) {
    return this.service.uploadConfirm(dto, userId);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierOrderItemDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/receive')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  receive(@Param('id') id: string, @Body() dto: ReceiveSupplierOrderItemDto) {
    return this.service.receiveManual(id, dto);
  }

  @Post(':id/unreceive')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  unreceive(@Param('id') id: string) {
    return this.service.unreceive(id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'BUYER')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
