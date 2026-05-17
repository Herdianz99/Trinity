import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DynamicKeysService } from './dynamic-keys.service';
import { CreateDynamicKeyDto } from './dto/create-dynamic-key.dto';
import { UpdateDynamicKeyDto } from './dto/update-dynamic-key.dto';
import { ValidateKeyDto } from './dto/validate-key.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Dynamic Keys')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('dynamic-keys')
export class DynamicKeysController {
  constructor(private readonly service: DynamicKeysService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id/logs')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findLogs(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findLogs(id, { from, to, page, limit });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  create(
    @Body() dto: CreateDynamicKeyDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateDynamicKeyDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle-active')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('validate')
  validate(@Body() dto: ValidateKeyDto) {
    return this.service.validate(dto);
  }
}
