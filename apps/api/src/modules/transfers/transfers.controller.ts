import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { TransfersService } from './transfers.service';
import { TransferPdfService } from './transfer-pdf.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@ApiTags('Transfers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('inventory')
@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly transferPdf: TransferPdfService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE)
  create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.transfersService.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.transfersService.findAll({ status, warehouseId });
  }

  // PDF con los articulos transferidos de un almacen a otro (Session 182)
  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, number } = await this.transferPdf.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="transferencia-${number}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.transfersService.approve(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.transfersService.cancel(id);
  }
}
