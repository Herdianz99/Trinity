import { Controller, Get, Post, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ExhibitionService } from './exhibition.service';
import { ExhibitionReportService } from './exhibition-report.service';
import { PlaceItemDto } from './dto/place-item.dto';
import { RemoveItemDto } from './dto/remove-item.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { QueryActivityDto } from './dto/query-activity.dto';

@ApiTags('exhibition')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('exhibicion')
@Controller('exhibition')
export class ExhibitionController {
  constructor(
    private readonly service: ExhibitionService,
    private readonly report: ExhibitionReportService,
  ) {}

  @Get('products')
  findProducts(@Query() query: QueryProductsDto) {
    return this.service.findProducts(query);
  }

  @Post('place')
  place(@Body() dto: PlaceItemDto, @CurrentUser() user: { id: string }) {
    return this.service.place(dto, user.id);
  }

  @Post('remove')
  remove(@Body() dto: RemoveItemDto, @CurrentUser() user: { id: string }) {
    return this.service.remove(dto, user.id);
  }

  @Get('activity')
  activity(@Query() query: QueryActivityDto) {
    return this.service.activity(query);
  }

  @Get('summary')
  summary(@Query() query: QueryActivityDto) {
    return this.service.summary(query);
  }

  @Get('products/:id/history')
  history(@Param('id') id: string) {
    return this.service.history(id);
  }

  @Get('activity/xlsx')
  async xlsx(@Query() query: QueryActivityDto, @Res() res: Response) {
    const rows = await this.service.activity(query);
    const buffer = this.report.buildXlsx(rows as any);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="exhibicion.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('activity/pdf')
  async pdf(@Query() query: QueryActivityDto, @Res() res: Response) {
    const rows = await this.service.activity(query);
    const buffer = await this.report.buildPdf(rows as any, query);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="exhibicion.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
