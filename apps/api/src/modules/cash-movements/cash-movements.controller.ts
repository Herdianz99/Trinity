import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CashMovementsService } from './cash-movements.service';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('CashMovements')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('cash-movements')
export class CashMovementsController {
  constructor(private readonly service: CashMovementsService) {}

  @Get()
  findBySession(@Query('cashSessionId') cashSessionId: string) {
    return this.service.findBySession(cashSessionId);
  }

  @Post()
  create(
    @Body() dto: CreateCashMovementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }
}
