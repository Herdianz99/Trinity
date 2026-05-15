import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCompanyConfigDto } from './dto/update-company-config.dto';
import * as bcrypt from 'bcrypt';

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
    const data: any = { ...dto };

    // Hash creditAuthPassword before saving
    if (data.creditAuthPassword) {
      data.creditAuthPassword = await bcrypt.hash(data.creditAuthPassword, 10);
    }

    return this.prisma.companyConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });
  }
}
