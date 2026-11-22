import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TotemCallsService } from './totem-calls.service';

// Llamados del totem para los vendedores. Sin @RequireModule: los vendedores no tienen el modulo
// chatbot; el servicio decide quien puede (vendedores y ADMIN). El rol TOTEM no entra (TotemGuard).
@ApiTags('Totem')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('totem-calls')
export class TotemCallsController {
  constructor(private calls: TotemCallsService) {}

  @Get('pending')
  pending(@CurrentUser('id') userId: string) {
    return this.calls.pending(userId);
  }

  @Post(':id/attend')
  @HttpCode(200)
  attend(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.calls.attend(id, userId);
  }
}
