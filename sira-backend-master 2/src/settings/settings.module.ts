import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { WhatsappNotifyModule } from '../whatsapp-notify/whatsapp-notify.module';

@Module({
  imports: [WhatsappNotifyModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
