import { Module } from '@nestjs/common';
import { MeService } from './me.service';
import { MeController } from './me.controller';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  imports: [PayrollModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
