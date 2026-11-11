import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreateUserDto, ResetUserPasswordDto, UpdateUserDto } from './users.dto';

const forbiddenRoles = new Set<UserRole>([UserRole.PLATFORM_SUPER_ADMIN]);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.companyMembership
      .findMany({
        where: { companyId: getCompanyId() },
        select: {
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
      })
      .then((memberships) =>
        memberships.map(({ user, role, createdAt }) => ({
          ...user,
          role,
          joinedAt: createdAt,
        })),
      );
  }

  async create(dto: CreateUserDto, actorId: string) {
    if (forbiddenRoles.has(dto.role)) {
      throw new BadRequestException(
        'Le rôle administrateur de plateforme ne peut pas être attribué depuis le cabinet.',
      );
    }

    const companyId = getCompanyId();
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Cette adresse email possède déjà un compte. Contactez un administrateur pour toute réactivation.',
      );
    }

    const passwordHash = await hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
            name: dto.name.trim(),
            passwordHash,
            memberships: {
              create: { companyId, role: dto.role },
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            createdAt: true,
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId: actorId,
            action: 'CABINET_MEMBER_CREATED',
            details: { userId: user.id, email, role: dto.role },
          },
        });
        return { ...user, role: dto.role };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Cette adresse email possède déjà un compte.',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (dto.role && forbiddenRoles.has(dto.role)) {
      throw new BadRequestException(
        'Le rôle administrateur de plateforme ne peut pas être attribué depuis le cabinet.',
      );
    }
    if (dto.role === undefined && dto.isActive === undefined) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }
    if (id === actorId && dto.isActive === false) {
      throw new BadRequestException(
        'Vous ne pouvez pas désactiver votre propre compte.',
      );
    }

    const companyId = getCompanyId();
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.companyMembership.findFirst({
        where: { userId: id, companyId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
      });
      if (!membership) throw new NotFoundException('Membre introuvable.');

      const nextRole = dto.role ?? membership.role;
      const nextActive = dto.isActive ?? membership.user.isActive;
      if (
        membership.role === UserRole.COMPANY_ADMIN &&
        membership.user.isActive &&
        (nextRole !== UserRole.COMPANY_ADMIN || !nextActive)
      ) {
        const otherActiveAdmins = await transaction.companyMembership.count({
          where: {
            companyId,
            role: UserRole.COMPANY_ADMIN,
            userId: { not: id },
            user: { isActive: true },
          },
        });
        if (otherActiveAdmins === 0) {
          throw new BadRequestException(
            'Le cabinet doit conserver au moins un administrateur actif.',
          );
        }
      }

      const updatedMembership = await transaction.companyMembership.update({
        where: { id: membership.id },
        data: { role: nextRole },
      });
      const updatedUser = await transaction.user.update({
        where: { id },
        data: { isActive: nextActive },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId: actorId,
          action: 'CABINET_MEMBER_UPDATED',
          details: {
            userId: id,
            role: updatedMembership.role,
            isActive: updatedUser.isActive,
          },
        },
      });
      return { ...updatedUser, role: updatedMembership.role };
    });
  }

  async resetPassword(id: string, dto: ResetUserPasswordDto, actorId: string) {
    const companyId = getCompanyId();
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: id, companyId },
      select: { user: { select: { id: true, email: true } } },
    });
    if (!membership) throw new NotFoundException('Membre introuvable.');

    const passwordHash = await hash(dto.password, 12);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          userId: actorId,
          action: 'CABINET_MEMBER_PASSWORD_RESET',
          details: { userId: id, email: membership.user.email },
        },
      });
    });
    return { id, passwordUpdated: true };
  }
}
