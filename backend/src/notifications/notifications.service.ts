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
    await this.syncUnpaidInvoiceNotifications(companyId);
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

  private async syncUnpaidInvoiceNotifications(companyId: string) {
    const prefix = 'Facture impayée · ';
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        WITH advisory_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${`invoice-alerts:${companyId}`}), 0)
        )
        SELECT 1 FROM advisory_lock
      `;
      const [memberships, invoices, existing] = await Promise.all([
        transaction.companyMembership.findMany({
          where: { companyId, user: { isActive: true } },
          select: { userId: true },
        }),
        transaction.invoice.findMany({
          where: {
            companyId,
            fiscalStatus: {
              notIn: [
                'DRAFT',
                'REJECTED',
                'CANCELLED',
              ],
            },
          },
          select: {
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            currency: true,
            customer: { select: { name: true } },
          },
          orderBy: { issueDate: 'desc' },
        }),
        transaction.notification.findMany({
          where: { companyId, title: { startsWith: prefix } },
          select: { id: true, userId: true, title: true, message: true, read: true },
        }),
      ]);

      const openInvoices = invoices.flatMap((invoice) => {
        const remaining = invoice.totalAmount.sub(invoice.paidAmount);
        if (!remaining.gt(0)) return [];
        const title = `${prefix}${invoice.invoiceNumber}`;
        const amount = new Intl.NumberFormat('fr-CD', {
          maximumFractionDigits: invoice.currency === 'CDF' ? 0 : 2,
        }).format(Number(remaining));
        return [{
          title,
          message: `${invoice.customer.name} · solde restant : ${amount} ${invoice.currency}. Ouvrez le recouvrement pour consulter la facture et enregistrer son paiement.`,
        }];
      });
      const openTitles = new Set(openInvoices.map((invoice) => invoice.title));
      const currentByKey = new Map(
        existing.map((item) => [`${item.userId}:${item.title}`, item]),
      );
      const createData: Prisma.NotificationCreateManyInput[] = [];

      for (const membership of memberships) {
        for (const invoice of openInvoices) {
          const existingItem = currentByKey.get(`${membership.userId}:${invoice.title}`);
          if (!existingItem) {
            createData.push({
              companyId,
              userId: membership.userId,
              title: invoice.title,
              message: invoice.message,
            });
          } else if (existingItem.message !== invoice.message) {
            await transaction.notification.update({
              where: { id: existingItem.id },
              data: { message: invoice.message },
            });
          }
        }
      }

      const settledUnreadIds = existing
        .filter((item) => !item.read && !openTitles.has(item.title))
        .map((item) => item.id);
      if (settledUnreadIds.length) {
        await transaction.notification.updateMany({
          where: { companyId, id: { in: settledUnreadIds } },
          data: { read: true },
        });
      }
      if (createData.length) {
        await transaction.notification.createMany({ data: createData });
      }
    });
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
