import { Module } from '@nestjs/common';
import { MailSettingsController } from './mail-settings.controller';
import { MailSettingsService } from './mail-settings.service';

@Module({
  controllers: [MailSettingsController],
  providers: [MailSettingsService],
  exports: [MailSettingsService],
})
export class MailSettingsModule {}
