import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
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
          where: { companyId: getCompanyId() },
          select: { companyId: true, role: true },
        },
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.memberships.length !== 1 ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Adresse email ou mot de passe invalide.');
    }

    const membership = user.memberships[0];
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
      },
    };
  }
}
