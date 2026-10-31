import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, RolesGuard],
})
export class InventoryModule {}
