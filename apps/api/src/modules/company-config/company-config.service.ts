import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';

@Injectable()
export class CompanyConfigService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let config = await this.prisma.companyConfig.findUnique({
      where: { id: 'singleton' },
    });
    if (!config) {
      config = await this.prisma.companyConfig.create({
        data: { id: 'singleton' },
      });
    }
    return config;
  }

  async update(dto: UpdateCompanyConfigDto) {
    return this.prisma.companyConfig.upsert({
      where: { id: 'singleton' },
      update: dto,
      create: { id: 'singleton', ...dto },
    });
  }
}
