import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { InventoryReplacementsService } from './inventory-replacements.service';
import { InventoryReplacementsPdfService } from './inventory-replacements-pdf.service';
import { CreateReplacementDto } from './dto/create-replacement.dto';
import { AddReplacementLineDto } from './dto/add-replacement-line.dto';
import {
  UpdateReplacementLinesDto,
  RemoveReplacementLinesDto,
} from './dto/update-replacement-lines.dto';

@ApiTags('Inventory Replacements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('inventory')
@Controller('inventory-replacements')
export class InventoryReplacementsController {
  constructor(
    private readonly service: InventoryReplacementsService,
    private readonly pdfService: InventoryReplacementsPdfService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateReplacementDto,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.findAll({ status, warehouseId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateReport(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reemplazo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':id/items')
  addLine(@Param('id') id: string, @Body() dto: AddReplacementLineDto) {
    return this.service.addLine(id, dto);
  }

  @Patch(':id/items')
  updateLines(@Param('id') id: string, @Body() dto: UpdateReplacementLinesDto) {
    return this.service.updateLines(id, dto);
  }

  @Post(':id/items/remove')
  removeLines(@Param('id') id: string, @Body() dto: RemoveReplacementLinesDto) {
    return this.service.removeLines(id, dto);
  }

  @Patch(':id/process')
  process(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; email: string; role: UserRole },
  ) {
    return this.service.process(id, user.id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
