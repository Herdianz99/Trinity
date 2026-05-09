import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CompanyConfigService } from './company-config.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Company Config')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('config')
export class CompanyConfigController {
  constructor(private configService: CompanyConfigService) {}

  @Get()
  get() {
    return this.configService.get();
  }

  @Roles(UserRole.ADMIN)
  @Patch()
  update(@Body() dto: UpdateCompanyConfigDto) {
    return this.configService.update(dto);
  }
}
