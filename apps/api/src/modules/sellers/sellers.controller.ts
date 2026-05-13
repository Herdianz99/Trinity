import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SellersService } from './sellers.service';
import { CreateSellerDto } from './dto/create-seller.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Sellers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sellers')
export class SellersController {
  constructor(private readonly service: SellersService) {}

  @Get()
  findAll(
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ isActive, search });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateSellerDto) {
    return this.service.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateSellerDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.service.toggleActive(id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/assign-user')
  assignUser(@Param('id') id: string, @Body() dto: AssignUserDto) {
    return this.service.assignUser(id, dto.userId ?? null);
  }

  @Get(':id/commission-report')
  getCommissionReport(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getCommissionReport(id, from, to);
  }
}
