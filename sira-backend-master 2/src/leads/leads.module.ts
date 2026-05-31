import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappNotifyModule } from '../whatsapp-notify/whatsapp-notify.module';

@Module({
  imports: [NotificationsModule, WhatsappNotifyModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule { }
