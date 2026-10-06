import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { LabelsService } from './labels.service';
import { GenerateLabelsDto } from './dto/generate-labels.dto';
import { GenerateBoxLabelsDto } from './dto/generate-box-labels.dto';

@ApiTags('Labels')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post('pdf')
  async getPdf(@Body() dto: GenerateLabelsDto, @Res() res: Response) {
    const buffer = await this.labelsService.generatePdf(dto);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="etiquetas.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Etiquetas de despacho por caja (cliente + contenido + "CAJA n DE N")
  @Post('boxes/pdf')
  async getBoxesPdf(@Body() dto: GenerateBoxLabelsDto, @Res() res: Response) {
    const buffer = await this.labelsService.generateBoxesPdf(dto);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="etiquetas-cajas.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
