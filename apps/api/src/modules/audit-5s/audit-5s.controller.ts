import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { Audit5SService } from './audit-5s.service';
import { CreateAudit5SDto } from './dto/create-audit-5s.dto';
import { QueryAudit5SDto } from './dto/query-audit-5s.dto';

@ApiTags('audit-5s')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('almacen')
@Controller('audit-5s')
export class Audit5SController {
  constructor(private readonly service: Audit5SService) {}

  @Get()
  findAll(@Query() query: QueryAudit5SDto) {
    return this.service.findAll(query);
  }

  @Get('summary')
  summary(@Query() query: QueryAudit5SDto) {
    return this.service.summary(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAudit5SDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }
}
