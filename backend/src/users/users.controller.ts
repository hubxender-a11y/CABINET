import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('cabinet-team')
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List the cabinet team and roles' })
  list() {
    return this.users.list();
  }

  @Post()
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a cabinet team member' })
  create(@Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest) {
    return this.users.create(dto, request.user!.sub);
  }

  @Patch(':id')
  @Roles(UserRole.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Change a team role or account status' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.users.update(id, dto, request.user!.sub);
  }
}
