import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryPdfService } from './disciplinary-pdf.service';
import { CreateFaultTypeDto } from './dto/create-fault-type.dto';
import { CreateDisciplinaryActionDto } from './dto/create-disciplinary-action.dto';
import { QueryDisciplinaryDto } from './dto/query-disciplinary.dto';

@ApiTags('disciplinary')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('payroll')
@Controller('disciplinary')
export class DisciplinaryController {
  constructor(
    private readonly service: DisciplinaryService,
    private readonly pdf: DisciplinaryPdfService,
  ) {}

  // ---- Tipos de falta (abiertos a cualquiera con el modulo payroll) ----
  @Get('fault-types')
  findAllTypes() {
    return this.service.findAllTypes();
  }

  @Get('fault-types/active')
  findActiveTypes() {
    return this.service.findActiveTypes();
  }

  @Post('fault-types')
  createType(@Body() dto: CreateFaultTypeDto) {
    return this.service.createType(dto);
  }

  @Patch('fault-types/:id')
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateFaultTypeDto>) {
    return this.service.updateType(id, dto);
  }

  @Patch('fault-types/:id/toggle-active')
  toggleTypeActive(@Param('id') id: string) {
    return this.service.toggleTypeActive(id);
  }

  // ---- Vista por empleado (stepper) ----
  @Get('by-employee/:employeeId')
  byEmployee(@Param('employeeId') employeeId: string) {
    return this.service.byEmployee(employeeId);
  }

  // ---- Acta PDF (antes de rutas con :id generico) ----
  @Get(':id/pdf')
  async pdfActa(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdf.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="acta-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ---- Amonestaciones ----
  @Get()
  findAll(@Query() query: QueryDisciplinaryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDisciplinaryActionDto, @CurrentUser() user: { id: string }) {
    return this.service.create(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
