import { Module } from '@nestjs/common';
import { Audit5SService } from './audit-5s.service';
import { Audit5SController } from './audit-5s.controller';

@Module({
  controllers: [Audit5SController],
  providers: [Audit5SService],
})
export class Audit5SModule {}
