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
import { setRequestCompanyId } from '../database/company-context';

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
    if (!payload.sub || !payload.companyId) {
      throw new UnauthorizedException('Session invalide.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        email: true,
        name: true,
        isActive: true,
        isPlatformAdmin: true,
        passwordChangedAt: true,
        memberships: {
          where: { companyId: payload.companyId, isActive: true },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!user?.isActive) throw new UnauthorizedException('Session invalide.');
    const membership = user.memberships[0];
    if (!membership && !user.isPlatformAdmin) {
      throw new UnauthorizedException('Session invalide.');
    }
    if (user.isPlatformAdmin) {
      const company = await this.prisma.company.findUnique({
        where: { id: payload.companyId },
        select: { id: true, isActive: true },
      });
      if (!company?.isActive) throw new UnauthorizedException('Session invalide ou entreprise archivée.');
    } else {
      const company = await this.prisma.company.findUnique({
        where: { id: payload.companyId },
        select: { isActive: true },
      });
      if (!company?.isActive) throw new UnauthorizedException('Session invalide ou entreprise archivée.');
    }
    setRequestCompanyId(payload.companyId);
    if (
      !payload.iat ||
      user.passwordChangedAt.getTime() > payload.iat * 1000 + 1000
    ) {
      throw new UnauthorizedException('Le mot de passe a changé. Reconnectez-vous.');
    }
    (request as AuthenticatedRequest).user = {
      ...payload,
      email: user.email,
      name: user.name,
      role: user.isPlatformAdmin
        ? UserRole.PLATFORM_SUPER_ADMIN
        : membership!.role,
      platformAdmin: user.isPlatformAdmin,
    };
    if (
      !user.isPlatformAdmin &&
      membership!.role === UserRole.MANAGING_PARTNER &&
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
