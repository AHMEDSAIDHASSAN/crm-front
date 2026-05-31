import { Module } from '@nestjs/common';
import { WhatsappNotifyService } from './whatsapp-notify.service';
import { PrismaModule } from '../config/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [WhatsappNotifyService],
  exports: [WhatsappNotifyService],
})
export class WhatsappNotifyModule {}
