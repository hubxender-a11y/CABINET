import { Module } from '@nestjs/common';
import { ManagingPartnerController } from './managing-partner.controller';
import { ManagingPartnerService } from './managing-partner.service';

@Module({ controllers: [ManagingPartnerController], providers: [ManagingPartnerService] })
export class ManagingPartnerModule {}
