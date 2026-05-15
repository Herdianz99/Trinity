import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CashRegistersService } from './cash-registers.service';
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
  constructor(private readonly service: CashRegistersService) {}

  @Get('cash-registers')
  findAll() {
    return this.service.findAll();
  }

  @Get('cash-registers/available')
  findAvailable(@CurrentUser() user: { id: string }) {
    return this.service.findAvailable(user.id);
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

  @Get('cash-sessions/:id/payments')
  findSessionPayments(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('methodId') methodId?: string,
  ) {
    return this.service.findSessionPayments(id, parseInt(page || '1', 10), methodId);
  }
}
