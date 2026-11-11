import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';
import { IS_PUBLIC_KEY } from './public.decorator';
import { PrismaService } from '../database/prisma.service';
import { isManagingPartnerRouteAllowed } from './managing-partner-access.guard';
import { UserRole } from '@prisma/client';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authentification requise.');
    }

    let payload: AuthenticatedUser;
    try {
      payload = await this.jwt.verifyAsync<AuthenticatedUser>(token);
    } catch {
      throw new UnauthorizedException('Session expirée ou invalide.');
    }
    if (
      !payload.sub ||
      payload.companyId !==
        (process.env.DEFAULT_COMPANY_ID ??
          '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20')
    ) {
      throw new UnauthorizedException('Session invalide.');
    }

    const membership = await this.prisma.companyMembership.findFirst({
      where: {
        userId: payload.sub,
        companyId: payload.companyId,
        user: { isActive: true },
      },
      select: {
        role: true,
        user: { select: { email: true, name: true, passwordChangedAt: true } },
      },
    });
    if (!membership) throw new UnauthorizedException('Session invalide.');
    if (
      !payload.iat ||
      membership.user.passwordChangedAt.getTime() > payload.iat * 1000 + 1000
    ) {
      throw new UnauthorizedException('Le mot de passe a changé. Reconnectez-vous.');
    }
    (request as AuthenticatedRequest).user = {
      ...payload,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
    };
    if (
      membership.role === UserRole.MANAGING_PARTNER &&
      !isManagingPartnerRouteAllowed(
        context.getClass().name,
        context.getHandler().name,
      )
    ) {
      throw new ForbiddenException('Ce rôle est limité aux OP, aux rapports et aux visas de caisse.');
    }
    return true;
  }
}
