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

  @Get('cash-registers/admin')
  @Roles(UserRole.ADMIN)
  findAllAdmin() {
    return this.service.findAllAdmin();
  }

  @Get('cash-registers/open')
  findOpen() {
    return this.service.findOpen();
  }

  @Roles(UserRole.ADMIN)
  @Post('cash-registers')
  createRegister(@Body() dto: CreateCashRegisterDto) {
    return this.service.createRegister(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('cash-registers/:id/update')
  updateRegister(@Param('id') id: string, @Body() dto: CreateCashRegisterDto) {
    return this.service.updateRegister(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('cash-registers/:id/toggle-active')
  toggleActiveRegister(@Param('id') id: string) {
    return this.service.toggleActiveRegister(id);
  }

  @Get('cash-sessions')
  findAllSessions(
    @Query('cashRegisterId') cashRegisterId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAllSessions(cashRegisterId, status);
  }

  @Get('cash-registers/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('cash-registers/:id/open-session')
  openSession(
    @Param('id') id: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.openSession(id, dto, user.id);
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
}
