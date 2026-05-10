import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FiscalService } from './fiscal.service';
import { QueryFiscalDto } from './dto/query-fiscal.dto';

@Controller('fiscal')
@UseGuards(AuthGuard('jwt'))
export class FiscalController {
  constructor(private readonly service: FiscalService) {}

  @Get('libro-ventas')
  libroVentas(@Query() query: QueryFiscalDto) {
    return this.service.libroVentas(query.from, query.to);
  }

  @Get('libro-compras')
  libroCompras(@Query() query: QueryFiscalDto) {
    return this.service.libroCompras(query.from, query.to);
  }

  @Get('resumen')
  resumen(@Query() query: QueryFiscalDto) {
    return this.service.resumen(query.from, query.to);
  }
}
