import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreCustomizationService } from './store-customization.service';
import { UpdateStorePaymentDto } from './dto/update-store-payment.dto';

/** Datos de Pago Movil de la tienda online (Tienda > Personalizacion). */
@ApiTags('Store Customization')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('store-settings/payment')
export class StorePaymentController {
  constructor(private service: StoreCustomizationService) {}

  @Get()
  get() {
    return this.service.getPayment();
  }

  @Patch()
  update(@Body() dto: UpdateStorePaymentDto) {
    return this.service.updatePayment(dto);
  }
}
