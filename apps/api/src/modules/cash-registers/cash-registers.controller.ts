import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CashRegistersService } from './cash-registers.service';
import { OpenSessionDto } from './dto/open-session.dto';
import { CloseSessionDto } from './dto/close-session.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Cash Registers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('cash-registers')
export class CashRegistersController {
  constructor(private readonly service: CashRegistersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('active-session')
  getActiveSession(@CurrentUser() user: { id: string }) {
    return this.service.getActiveSession(user.id);
  }

  @Post(':id/open')
  openSession(
    @Param('id') id: string,
    @Body() dto: OpenSessionDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.openSession(id, dto, user.id);
  }

  @Post(':id/close')
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.closeSession(id, dto, user.id);
  }
}
