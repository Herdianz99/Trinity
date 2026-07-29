import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PurchaseAiService } from './purchase-ai.service';
import { ExtractInvoiceDto } from './dto/extract-invoice.dto';

@ApiTags('PurchaseAI')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('purchases/ai')
export class PurchaseAiController {
  constructor(private readonly service: PurchaseAiService) {}

  /** Lee una factura (PDF/imagen) con IA y devuelve un borrador con match de productos. */
  @Post('extract')
  extract(@Body() dto: ExtractInvoiceDto) {
    return this.service.extractAndMatch(dto);
  }
}
