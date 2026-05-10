import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ImportService } from './import.service';
import { BulkImportDto } from './dto/import.dto';

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
  executeImport(@Body() dto: BulkImportDto) {
    return this.importService.executeImport(dto);
  }
}
