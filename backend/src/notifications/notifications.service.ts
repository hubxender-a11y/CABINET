import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyRoles(
    transaction: Prisma.TransactionClient,
    companyId: string,
    roles: UserRole[],
    title: string,
    message: string,
    excludeUserId?: string,
  ) {
    const recipients = await transaction.companyMembership.findMany({
      where: {
        companyId,
        role: { in: roles },
        user: {
          isActive: true,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
      },
      select: { userId: true },
    });
    const globalManagingPartners = roles.includes(UserRole.PLATFORM_MANAGING_PARTNER)
      ? await transaction.user.findMany({
          where: {
            platformRole: UserRole.PLATFORM_MANAGING_PARTNER,
            isActive: true,
            ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          },
          select: { id: true },
        })
      : [];
    const recipientIds = new Set([
      ...recipients.map(({ userId }) => userId),
      ...globalManagingPartners.map(({ id }) => id),
    ]);
    if (recipientIds.size === 0) return { count: 0 };

    return transaction.notification.createMany({
      data: [...recipientIds].map((userId) => ({
        companyId,
        userId,
        title: title.slice(0, 180),
        message: message.slice(0, 2000),
      })),
    });
  }

  listAcrossCompanies(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      include: { company: { select: { id: true, legalName: true, tradeName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  async markReadAcrossCompanies(id: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    if (result.count === 0) throw new NotFoundException('Notification introuvable.');
    return { success: true };
  }

  async markAllReadAcrossCompanies(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  list(companyId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string, companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, companyId, userId },
      data: { read: true },
    });
    if (result.count === 0) {
      throw new NotFoundException('Notification introuvable.');
    }
    return { success: true };
  }

  async markAllRead(companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { companyId, userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
