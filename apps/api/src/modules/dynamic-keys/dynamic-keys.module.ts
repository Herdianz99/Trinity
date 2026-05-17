import { Module } from '@nestjs/common';
import { DynamicKeysController } from './dynamic-keys.controller';
import { DynamicKeysService } from './dynamic-keys.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DynamicKeysController],
  providers: [DynamicKeysService],
  exports: [DynamicKeysService],
})
export class DynamicKeysModule {}
