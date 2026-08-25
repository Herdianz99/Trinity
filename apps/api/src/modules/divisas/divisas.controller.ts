import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DivisasService } from './divisas.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateBsLoadDto } from './dto/create-bs-load.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';

@ApiTags('divisas')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('divisas')
@Controller('divisas')
export class DivisasController {
  constructor(private readonly service: DivisasService) {}

  // ── Empresas ──
  @Get('companies')
  findCompanies(@Query('all') all?: string) {
    return this.service.findCompanies(all === 'true');
  }

  @Post('companies')
  createCompany(@Body() dto: CreateCatalogDto) {
    return this.service.createCompany(dto);
  }

  @Patch('companies/:id')
  updateCompany(@Param('id') id: string, @Body() dto: Partial<CreateCatalogDto>) {
    return this.service.updateCompany(id, dto);
  }

  // ── Bancos / Ubicaciones ──
  @Get('banks')
  findBanks(@Query('all') all?: string) {
    return this.service.findBanks(all === 'true');
  }

  @Post('banks')
  createBank(@Body() dto: CreateCatalogDto) {
    return this.service.createBank(dto);
  }

  @Patch('banks/:id')
  updateBank(@Param('id') id: string, @Body() dto: Partial<CreateCatalogDto>) {
    return this.service.updateBank(id, dto);
  }

  // ── Bancos de origen (Bs) ──
  @Get('origin-banks')
  findOriginBanks(@Query('all') all?: string) {
    return this.service.findOriginBanks(all === 'true');
  }

  @Post('origin-banks')
  createOriginBank(@Body() dto: CreateCatalogDto) {
    return this.service.createOriginBank(dto);
  }

  @Patch('origin-banks/:id')
  updateOriginBank(@Param('id') id: string, @Body() dto: Partial<CreateCatalogDto>) {
    return this.service.updateOriginBank(id, dto);
  }

  // ── Cargas de Bs por empresa ──
  @Get('bs-loads')
  findBsLoads(@Query('companyId') companyId: string) {
    return this.service.findBsLoads(companyId);
  }

  @Post('bs-loads')
  createBsLoad(@Body() dto: CreateBsLoadDto, @CurrentUser() user: { id: string }) {
    return this.service.createBsLoad(dto, user.id);
  }

  @Delete('bs-loads/:id')
  deleteBsLoad(@Param('id') id: string) {
    return this.service.deleteBsLoad(id);
  }

  // ── Saldos ──
  @Get('summary')
  summary() {
    return this.service.summary();
  }

  // ── Movimientos ──
  @Get('movements')
  findMovements(@Query() query: QueryMovementsDto) {
    return this.service.findMovements(query);
  }

  @Post('movements')
  createMovement(@Body() dto: CreateMovementDto, @CurrentUser() user: { id: string }) {
    return this.service.createMovement(dto, user.id);
  }

  @Patch('movements/:id')
  updateMovement(@Param('id') id: string, @Body() dto: Partial<CreateMovementDto>) {
    return this.service.updateMovement(id, dto);
  }

  @Delete('movements/:id')
  deleteMovement(@Param('id') id: string) {
    return this.service.deleteMovement(id);
  }
}
