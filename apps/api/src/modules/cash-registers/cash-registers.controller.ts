import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CashRegistersService } from './cash-registers.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Cash Registers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller()
export class CashRegistersController {
  constructor(private readonly service: CashRegistersService) {}

  @Get('cash-registers')
  findAll() {
    return this.service.findAll();
  }

  @Get('cash-registers/open')
  findOpen() {
    return this.service.findOpen();
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
