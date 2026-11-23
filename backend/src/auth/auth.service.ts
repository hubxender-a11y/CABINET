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
          select: {
            companyId: true,
            role: true,
            company: {
              select: { legalName: true, tradeName: true, logoUrl: true },
            },
          },
        },
      },
    });

    if (
      !user ||
      !user.isActive ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException(
        'Adresse email ou mot de passe invalide.',
      );
    }

    if (!user.memberships.length) {
      throw new UnauthorizedException(
        'Aucun espace de travail n’est associé à ce compte.',
      );
    }

    const defaultCompanyId =
      process.env.DEFAULT_COMPANY_ID ?? '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';
    const platformMembership = user.memberships.find(
      ({ role }) => role === 'PLATFORM_SUPER_ADMIN',
    );
    const platformManagingPartner =
      !platformMembership && user.platformRole === 'PLATFORM_MANAGING_PARTNER';

    if (
      !dto.companyId &&
      !platformMembership &&
      !platformManagingPartner &&
      user.memberships.length > 1
    ) {
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

    const membership =
      platformMembership ??
      (dto.companyId
        ? user.memberships.find(({ companyId }) => companyId === dto.companyId)
        : user.memberships[0]);
    if (!membership) {
      throw new UnauthorizedException(
        'Cet espace n’est pas autorisé pour ce compte.',
      );
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      companyId:
        membership.role === 'PLATFORM_SUPER_ADMIN' || platformManagingPartner
          ? defaultCompanyId
          : membership.companyId,
      role: platformManagingPartner
        ? 'PLATFORM_MANAGING_PARTNER'
        : membership.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_LIFETIME,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: platformManagingPartner
          ? 'PLATFORM_MANAGING_PARTNER'
          : membership.role,
        companyName:
          membership.role === 'PLATFORM_SUPER_ADMIN'
            ? 'Administration globale'
            : platformManagingPartner
              ? 'Associé-Gérant · Toutes les sociétés'
            : membership.company.tradeName || membership.company.legalName,
        companyLogoUrl: membership.company.logoUrl,
      },
    };
  }
}
