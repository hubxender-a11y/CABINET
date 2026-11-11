import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';

@Module({
  imports: [NotificationsModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, RolesGuard],
})
export class FixedAssetsModule {}
