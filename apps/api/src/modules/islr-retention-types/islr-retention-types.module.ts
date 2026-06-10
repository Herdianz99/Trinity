import { Module } from '@nestjs/common';
import { IslrRetentionTypesController } from './islr-retention-types.controller';
import { IslrRetentionTypesService } from './islr-retention-types.service';

@Module({
  controllers: [IslrRetentionTypesController],
  providers: [IslrRetentionTypesService],
  exports: [IslrRetentionTypesService],
})
export class IslrRetentionTypesModule {}
