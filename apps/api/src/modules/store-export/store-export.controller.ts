import { Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreExportService } from './store-export.service';

@ApiTags('Store Export')
@ApiBearerAuth()
@Controller('store-export')
export class StoreExportController {
  constructor(private service: StoreExportService) {}

  // POST /store-export/run — regenera el snapshot ya mismo (solo ADMIN)
  @Post('run')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async run() {
    return this.service.exportCatalog();
  }
}
