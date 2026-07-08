import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
