import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { ModuleGuard } from '../../common/guards/module.guard';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { AckNotificationDto } from './dto/ack-notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  // ---- Emisor (RRHH / ADMIN / SUPERVISOR) ----
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Post()
  create(@Body() dto: CreateNotificationDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Get('targets')
  targets() {
    return this.service.targets();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Get()
  list(@Query('type') type?: string) {
    return this.service.listForSender({ type });
  }

  // ---- Empleado (buzón) — scoped por token ----
  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('mi-perfil')
  @Get('me/inbox')
  inbox(@CurrentUser('id') userId: string, @Query('ackState') ackState?: string) {
    return this.service.inbox(userId, ackState);
  }

  @UseGuards(AuthGuard('jwt'), ModuleGuard)
  @RequireModule('mi-perfil')
  @Patch('me/:recipientId/ack')
  ack(
    @CurrentUser('id') userId: string,
    @Param('recipientId') recipientId: string,
    @Body() dto: AckNotificationDto,
  ) {
    return this.service.ack(userId, recipientId, dto);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.RRHH, UserRole.SUPERVISOR)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detailForSender(id);
  }
}
