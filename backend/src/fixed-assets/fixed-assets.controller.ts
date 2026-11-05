import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CreateFixedAssetDto,
  CreateFixedAssetMovementDto,
} from './fixed-assets.dto';
import { FixedAssetsService } from './fixed-assets.service';

@ApiTags('fixed-assets')
@ApiBearerAuth()
@Controller('fixed-assets')
@UseGuards(RolesGuard)
export class FixedAssetsController {
  constructor(private readonly assets: FixedAssetsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.assets.list(request.user!.companyId);
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.FINANCE_MANAGER)
  create(
    @Body() dto: CreateFixedAssetDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.assets.create(dto, request.user!.companyId, request.user!.sub);
  }

  @Post(':id/movements')
  @Roles(UserRole.COMPANY_ADMIN, UserRole.ACCOUNTANT, UserRole.FINANCE_MANAGER)
  addMovement(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateFixedAssetMovementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.assets.addMovement(
      id,
      dto,
      request.user!.companyId,
      request.user!.sub,
    );
  }
}
