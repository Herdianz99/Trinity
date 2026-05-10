import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolePermissionsService } from './role-permissions.service';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Role Permissions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private rolePermissionsService: RolePermissionsService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.rolePermissionsService.findAll();
  }

  @Roles(UserRole.ADMIN)
  @Patch(':role')
  update(
    @Param('role') role: UserRole,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolePermissionsService.update(role, dto.modules);
  }
}
