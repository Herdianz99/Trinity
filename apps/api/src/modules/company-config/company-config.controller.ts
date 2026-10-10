import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CompanyConfigService } from './company-config.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Company Config')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('config')
export class CompanyConfigController {
  constructor(private configService: CompanyConfigService) {}

  // GET abierto a cualquier usuario logueado (POS, sidebar...). A quien no es ADMIN no se le
  // entregan datos sensibles: la clave de autorizacion de credito ni la whitelist de IPs.
  @Get()
  async get(@CurrentUser('role') role: UserRole) {
    const config = await this.configService.get();
    if (role === UserRole.ADMIN) return config;
    const { creditAuthPassword, allowedIps, ...safe } = config;
    return safe;
  }

  @Roles(UserRole.ADMIN)
  @Patch()
  update(@Body() dto: UpdateCompanyConfigDto) {
    return this.configService.update(dto);
  }
}
