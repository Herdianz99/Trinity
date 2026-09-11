import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { BancosService } from './bancos.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { CreateBankMovementDto, CreateTransferDto } from './dto/create-bank-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { ReconcileDto } from './dto/reconcile.dto';

@ApiTags('bancos')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ModuleGuard)
@RequireModule('bancos')
@Controller('bancos')
export class BancosController {
  constructor(private readonly service: BancosService) {}

  @Get('summary') summary() {
    return this.service.summary();
  }

  @Get('accounts') listAccounts() {
    return this.service.listAccounts();
  }
  @Post('accounts') createAccount(@Body() dto: CreateBankAccountDto) {
    return this.service.createAccount(dto);
  }
  @Patch('accounts/:id') updateAccount(@Param('id') id: string, @Body() dto: Partial<CreateBankAccountDto>) {
    return this.service.updateAccount(id, dto);
  }

  @Get('accounts/:id/ledger') ledger(@Param('id') id: string, @Query() q: QueryMovementsDto) {
    return this.service.ledger(id, q);
  }

  @Post('movements') createManual(@Body() dto: CreateBankMovementDto, @CurrentUser() user: { id: string }) {
    return this.service.createManualMovement(dto, user.id);
  }
  @Post('transfers') createTransfer(@Body() dto: CreateTransferDto, @CurrentUser() user: { id: string }) {
    return this.service.createTransfer(dto, user.id);
  }
  @Delete('movements/:id') deleteMovement(@Param('id') id: string) {
    return this.service.deleteMovement(id);
  }

  @Post('reconcile') reconcile(@Body() dto: ReconcileDto, @CurrentUser() user: { id: string }) {
    return this.service.reconcile(dto, user.id);
  }
}
