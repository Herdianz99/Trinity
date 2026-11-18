import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationAttachmentsService } from './notification-attachments.service';
import { ProductImagesModule } from '../product-images/product-images.module';

@Module({
  imports: [ProductImagesModule], // SpacesService para los adjuntos
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationAttachmentsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
