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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CashRegistersService } from './cash-registers.service';
import { CashSessionPdfService } from './cash-session-pdf.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Cash Registers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller()
export class CashRegistersController {
  constructor(
    private readonly service: CashRegistersService,
    private readonly pdfService: CashSessionPdfService,
  ) {}

  @Get('cash-registers')
  findAll() {
    return this.service.findAll();
  }

  @Get('cash-registers/available')
  findAvailable(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.service.findAvailable(user);
  }

  @Get('cash-registers/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post('cash-registers')
  createRegister(@Body() dto: CreateCashRegisterDto) {
    return this.service.createRegister(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('cash-registers/:id')
  updateRegister(@Param('id') id: string, @Body() dto: CreateCashRegisterDto) {
    return this.service.updateRegister(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('cash-registers/:id/toggle-active')
  toggleActiveRegister(@Param('id') id: string) {
    return this.service.toggleActiveRegister(id);
  }

  @Post('cash-registers/:id/open')
  openSession(
    @Param('id') id: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.openSession(id, dto, user.id);
  }

  @Get('cash-registers/:id/sessions')
  findRegisterSessions(@Param('id') id: string) {
    return this.service.findRegisterSessions(id);
  }

  @Get('cash-sessions')
  findAllSessions(
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAllSessions({ cashRegisterId, userId, status, from, to });
  }

  @Post('cash-sessions/:id/close')
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.closeSession(id, dto, user.id);
  }

  @Get('cash-sessions/:id/summary')
  getSessionSummary(@Param('id') id: string) {
    return this.service.getSessionSummary(id);
  }

  // Reconstruir el libro mayor de caja de una sesion (ADMIN). Idempotente.
  @Post('cash-sessions/:id/backfill-ledger')
  @Roles(UserRole.ADMIN)
  backfillLedger(@Param('id') id: string) {
    return this.service.backfillLedger(id);
  }

  // Reconstruir el ledger de todas las sesiones abiertas (ADMIN) — antes de encender el flag.
  @Post('cash/backfill-ledger-open')
  @Roles(UserRole.ADMIN)
  backfillAllOpenLedger() {
    return this.service.backfillAllOpenLedger();
  }

  /** Tabla madre (CashLedgerEntry): TODAS las filas del libro mayor, de cualquier origen y metodo */
  @Get('cash/ledger-entries')
  getLedgerEntries(
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
    @Query('sourceType') sourceType?: string,
    @Query('currency') currency?: string,
    @Query('onlyCash') onlyCash?: string,
    @Query('page') page?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    return this.service.getLedgerEntries(
      { cashRegisterId, userId, sessionId, from, to, methodIds: ids, sourceType, currency, onlyCash: onlyCash === 'true' },
      parseInt(page || '1', 10),
    );
  }

  /** PDF detallado de la tabla madre (libro mayor), agrupado por origen, respetando filtros */
  @Get('cash/ledger-entries-report')
  async getLedgerEntriesReport(
    @Res() res: Response,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
    @Query('sourceType') sourceType?: string,
    @Query('currency') currency?: string,
    @Query('onlyCash') onlyCash?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    const buffer = await this.pdfService.generateLedgerReport({
      cashRegisterId, userId, sessionId, from, to, methodIds: ids,
      sourceType, currency, onlyCash: onlyCash === 'true',
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="libro-mayor-caja.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** PDF RESUMIDO del libro mayor: solo el neto por metodo de pago, respetando filtros */
  @Get('cash/ledger-entries-summary')
  async getLedgerEntriesSummary(
    @Res() res: Response,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
    @Query('sourceType') sourceType?: string,
    @Query('currency') currency?: string,
    @Query('onlyCash') onlyCash?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    const buffer = await this.pdfService.generateLedgerSummaryReport({
      cashRegisterId, userId, sessionId, from, to, methodIds: ids,
      sourceType, currency, onlyCash: onlyCash === 'true',
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="libro-mayor-resumen.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('cash-sessions/:id/payments')
  findSessionPayments(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('methodId') methodId?: string,
  ) {
    return this.service.findSessionPayments(id, parseInt(page || '1', 10), methodId);
  }

  @Get('cash-sessions/:id/movements-report')
  async getMovementsReport(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cierre-caja-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** Vista global de movimientos de caja (cruza cajas y sesiones) */
  @Get('cash/movements')
  findGlobalMovements(
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
    @Query('page') page?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    return this.service.findGlobalMovements(
      { cashRegisterId, userId, from, to, methodIds: ids },
      parseInt(page || '1', 10),
    );
  }

  /** PDF de la vista global, agrupado por metodo de pago, respetando filtros */
  @Get('cash/movements-report')
  async getGlobalMovementsReport(
    @Res() res: Response,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    const buffer = await this.pdfService.generateGlobalReport({
      cashRegisterId,
      userId,
      from,
      to,
      methodIds: ids,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="movimientos-caja.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  /** PDF RESUMIDO de la vista global: solo totales por metodo de pago (+ por caja), respetando filtros */
  @Get('cash/movements-summary')
  async getGlobalMovementsSummary(
    @Res() res: Response,
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('methodIds') methodIds?: string,
  ) {
    const ids = methodIds ? methodIds.split(',').filter(Boolean) : undefined;
    const buffer = await this.pdfService.generateGlobalSummaryReport({
      cashRegisterId,
      userId,
      from,
      to,
      methodIds: ids,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="resumen-caja.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
