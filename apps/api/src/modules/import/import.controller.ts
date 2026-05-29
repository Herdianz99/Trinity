import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ImportService } from './import.service';
import { BulkImportDto } from './dto/import.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Import')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('import')
export class ImportController {
  constructor(private importService: ImportService) {}

  @Post('validate')
  validate(@Body() dto: BulkImportDto) {
    return this.importService.validate(dto);
  }

  @Post()
  executeImport(
    @Body() dto: BulkImportDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.importService.executeImport(dto, userId);
  }

  @Post('reset')
  resetData() {
    return this.importService.resetData();
  }
}
