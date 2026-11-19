import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './auth.dto';

export const ACCESS_TOKEN_LIFETIME = '1h';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: {
        memberships: {
          where: { isActive: true },
          select: {
            companyId: true,
            role: true,
            company: { select: { legalName: true, tradeName: true, logoUrl: true } },
          },
        },
      },
    });

    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Adresse email ou mot de passe invalide.');
    }

    const configuredPlatformAdminEmail =
      process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    if (
      !user.isPlatformAdmin &&
      configuredPlatformAdminEmail &&
      user.email.toLowerCase() === configuredPlatformAdminEmail
    ) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: { isPlatformAdmin: true },
        });
        const initialCompanyId = user.memberships[0]?.companyId;
        if (initialCompanyId) {
          await transaction.auditLog.create({
            data: {
              companyId: initialCompanyId,
              userId: user.id,
              action: 'PLATFORM_ADMIN_BOOTSTRAPPED',
              details: { email: user.email },
            },
          });
        }
      });
      user.isPlatformAdmin = true;
    }

    if (!user.memberships.length && !user.isPlatformAdmin) {
      throw new UnauthorizedException('Aucun espace de travail n’est associé à ce compte.');
    }
    if (user.isPlatformAdmin) {
      const companies = await this.prisma.company.findMany({
        select: { id: true, legalName: true, tradeName: true, logoUrl: true },
        orderBy: { legalName: 'asc' },
      });
      if (!companies.length) {
        throw new UnauthorizedException('Aucun espace de travail n’est disponible.');
      }
      if (!dto.companyId && companies.length > 1) {
        return {
          requiresCompanySelection: true as const,
          companies: companies.map((company) => ({
            id: company.id,
            name: company.tradeName || company.legalName,
            logoUrl: company.logoUrl,
            role: 'PLATFORM_SUPER_ADMIN' as const,
          })),
        };
      }
      const company = dto.companyId
        ? companies.find(({ id }) => id === dto.companyId)
        : companies[0];
      if (!company) {
        throw new UnauthorizedException('Cet espace n’est pas autorisé pour ce compte.');
      }
      return this.issueSession(user, {
        companyId: company.id,
        role: 'PLATFORM_SUPER_ADMIN',
        company,
      });
    }
    if (!dto.companyId && user.memberships.length > 1) {
      return {
        requiresCompanySelection: true as const,
        companies: user.memberships.map(({ companyId, role, company }) => ({
          id: companyId,
          name: company.tradeName || company.legalName,
          logoUrl: company.logoUrl,
          role,
        })),
      };
    }
    const membership = dto.companyId
      ? user.memberships.find(({ companyId }) => companyId === dto.companyId)
      : user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException('Cet espace n’est pas autorisé pour ce compte.');
    }
    return this.issueSession(user, membership);
  }

  async companies(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, isPlatformAdmin: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('Session invalide.');
    if (user.isPlatformAdmin) {
      const companies = await this.prisma.company.findMany({
        select: { id: true, legalName: true, tradeName: true, logoUrl: true },
        orderBy: { legalName: 'asc' },
      });
      return companies.map((company) => ({
        id: company.id,
        name: company.tradeName || company.legalName,
        role: 'PLATFORM_SUPER_ADMIN' as const,
      }));
    }
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, isActive: true, user: { isActive: true } },
      select: {
        companyId: true,
        role: true,
        company: { select: { legalName: true, tradeName: true, logoUrl: true } },
      },
      orderBy: { company: { legalName: 'asc' } },
    });
    return memberships.map(({ companyId, role, company }) => ({
      id: companyId,
      name: company.tradeName || company.legalName,
      role,
    }));
  }

  async switchCompany(userId: string, companyId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, isActive: true, isPlatformAdmin: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('Session invalide.');
    if (user.isPlatformAdmin) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, legalName: true, tradeName: true, logoUrl: true },
      });
      if (!company) throw new UnauthorizedException('Entreprise introuvable.');
      return this.issueSession(user, {
        companyId: company.id,
        role: 'PLATFORM_SUPER_ADMIN',
        company,
      });
    }
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId, companyId, isActive: true, user: { isActive: true } },
      select: {
        companyId: true,
        role: true,
        company: { select: { legalName: true, tradeName: true, logoUrl: true } },
      },
    });
    if (!membership) {
      throw new UnauthorizedException('Cet espace n’est pas autorisé pour ce compte.');
    }
    return this.issueSession(user, membership);
  }

  private async issueSession(
    user: { id: string; email: string; name: string },
    membership: {
      companyId: string;
      role: import('@prisma/client').UserRole;
      company: { legalName: string; tradeName: string | null; logoUrl: string | null };
    },
  ) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      companyId: membership.companyId,
      role: membership.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_LIFETIME,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: membership.role,
        companyId: membership.companyId,
        companyName: membership.company.tradeName || membership.company.legalName,
        companyLogoUrl: membership.company.logoUrl,
      },
    };
  }
}
