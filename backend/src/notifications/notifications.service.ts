import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

type NotificationTransaction = Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyRoles(
    transaction: NotificationTransaction,
    companyId: string,
    roles: UserRole[],
    title: string,
    message: string,
    excludeUserId?: string,
  ) {
    const memberships = await transaction.companyMembership.findMany({
      where: {
        companyId,
        role: {
          in: [
            ...new Set([
              ...roles,
              UserRole.COMPANY_ADMIN,
              UserRole.MANAGING_PARTNER,
              UserRole.CASHIER,
            ]),
          ],
        },
        user: {
          isActive: true,
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        },
      },
      select: { userId: true },
    });
    if (!memberships.length) return 0;

    const result = await transaction.notification.createMany({
      data: memberships.map(({ userId }) => ({
        companyId,
        userId,
        title,
        message,
      })),
    });
    return result.count;
  }

  async notifyUser(
    transaction: NotificationTransaction,
    companyId: string,
    userId: string,
    title: string,
    message: string,
  ) {
    const notification = await transaction.notification.create({
      data: { companyId, userId, title, message },
    });
    await this.notifyRoles(
      transaction,
      companyId,
      [],
      title,
      message,
      userId,
    );
    return notification;
  }

  async list(companyId: string, userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
    };
  }

  async markRead(id: string, companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, companyId, userId },
      data: { read: true },
    });
    if (!result.count) throw new NotFoundException('Notification introuvable.');
    return { id, read: true };
  }

  async markAllRead(companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { companyId, userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  async sendReportToManagingPartner(
    companyId: string,
    userId: string,
    senderName: string,
    period: string,
  ) {
    const [year, month] = period.split('-').map(Number);
    if (!year || month < 1 || month > 12) {
      throw new BadRequestException('La période du rapport est invalide.');
    }
    const label = new Intl.DateTimeFormat('fr-CD', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Kinshasa',
    }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
    return this.prisma.$transaction(async (transaction) => {
      const count = await this.notifyRoles(
        transaction,
        companyId,
        [UserRole.COMPANY_ADMIN, UserRole.MANAGING_PARTNER],
        `Rapport à vérifier · ${period}`,
        `${senderName} a transmis le rapport de ${label} pour vérification.`,
        userId,
      );
      if (!count) {
        throw new NotFoundException(
          'Aucun compte Associé-Gérant actif ne peut recevoir cette notification.',
        );
      }
      return { notified: count, period };
    });
  }
}
