import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { FixedAssetsController } from './fixed-assets.controller';
import { FixedAssetsService } from './fixed-assets.service';

@Module({
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService, RolesGuard],
})
export class FixedAssetsModule {}
