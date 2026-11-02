import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from './authenticated-user';
import { Public } from './public.decorator';
import { LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate a cabinet team member' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Read the authenticated cabinet member identity' })
  me(@Req() request: AuthenticatedRequest) {
    const user = request.user!;
    return {
      id: user.sub,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check for the API host' })
  health() {
    return { status: 'ok' };
  }
}
