import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { ArchivesController } from './archives.controller';
import { ArchivesService } from './archives.service';

@Module({
  controllers: [ArchivesController],
  providers: [ArchivesService, RolesGuard],
})
export class ArchivesModule {}
