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
    const recipients = await transaction.user.findMany({
      where: {
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        OR: [
          { isPlatformAdmin: true },
          { platformRole: UserRole.PLATFORM_MANAGING_PARTNER },
          {
            memberships: {
              some: {
                companyId,
                isActive: true,
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
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!recipients.length) return 0;

    const result = await transaction.notification.createMany({
      data: recipients.map(({ id: userId }) => ({
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

  async list(companyId: string, userId: string, role: UserRole, globalManagingPartner = false) {
    await this.syncUnpaidInvoiceNotifications(companyId);
    if (
      role === UserRole.COMPANY_ADMIN ||
      role === UserRole.PLATFORM_SUPER_ADMIN ||
      globalManagingPartner
    ) {
      const rows = await this.prisma.notification.findMany({
        where: { companyId },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = JSON.stringify([
          row.title,
          row.message,
          row.createdAt.toISOString(),
        ]);
        const group = groups.get(key) ?? [];
        group.push(row);
        groups.set(key, group);
      }
      const notifications = Array.from(groups.values())
        .slice(0, 100)
        .map((group) => {
          const adminCopy = group.find((item) => item.userId === userId);
          const readState = adminCopy ? adminCopy.read : globalManagingPartner ? group.every((item) => item.read) : true;
          return {
            id: adminCopy?.id ?? group[0].id,
            title: group[0].title,
            message: group[0].message,
            read: readState,
            createdAt: group[0].createdAt,
            recipients: Array.from(
              new Set(group.map((item) => item.user?.name ?? 'Compte désactivé')),
            ),
            isAdminCopy: Boolean(adminCopy) || globalManagingPartner,
          };
        });
      return {
        notifications,
        unreadCount: notifications.filter(
          (item) => item.isAdminCopy && !item.read,
        ).length,
        teamWide: true,
      };
    }
    const notifications = await this.prisma.notification.findMany({
      where: globalManagingPartner ? { companyId } : { companyId, userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      teamWide: false,
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
      const [recipients, invoices, existing] = await Promise.all([
        transaction.user.findMany({
          where: {
            isActive: true,
            OR: [
              { isPlatformAdmin: true },
              { memberships: { some: { companyId, isActive: true } } },
            ],
          },
          select: { id: true },
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

      for (const recipient of recipients) {
        for (const invoice of openInvoices) {
          const existingItem = currentByKey.get(`${recipient.id}:${invoice.title}`);
          if (!existingItem) {
            createData.push({
              companyId,
              userId: recipient.id,
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

  async markRead(id: string, companyId: string, userId: string, globalManagingPartner = false) {
    let where: Prisma.NotificationWhereInput = { id, companyId, userId };
    if (globalManagingPartner) {
      const selected = await this.prisma.notification.findFirst({ where: { id, companyId }, select: { title: true, message: true, createdAt: true } });
      if (!selected) throw new NotFoundException('Notification introuvable.');
      where = { companyId, title: selected.title, message: selected.message, createdAt: selected.createdAt };
    }
    const result = await this.prisma.notification.updateMany({
      where,
      data: { read: true },
    });
    if (!result.count) throw new NotFoundException('Notification introuvable.');
    return { id, read: true };
  }

  async markAllRead(companyId: string, userId: string, globalManagingPartner = false) {
    const result = await this.prisma.notification.updateMany({
      where: globalManagingPartner ? { companyId, read: false } : { companyId, userId, read: false },
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

  async sendAssetReportToManagingPartner(
    companyId: string,
    senderId: string,
    senderName: string,
    report: {
      period: string;
      total: number;
      active: number;
      maintenance: number;
      disposed: number;
      movementCount: number;
      totals: Record<string, { acquisitionCost: string; netBookValue: string }>;
    },
    note: string,
  ) {
    const [year, month] = report.period.split('-').map(Number);
    const label = new Intl.DateTimeFormat('fr-CD', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Africa/Kinshasa',
    }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
    const amounts = Object.entries(report.totals)
      .map(([currency, totals]) => {
        const amount = new Intl.NumberFormat('fr-CD', {
          maximumFractionDigits: currency === 'CDF' ? 0 : 2,
        }).format(Number(totals.netBookValue));
        return `${amount} ${currency}`;
      })
      .join(' · ') || 'Aucune valeur enregistrée';
    const message = [
      `${senderName} a transmis l’état du patrimoine pour ${label}.`,
      `${report.total} bien(s) au total : ${report.active} en service, ${report.maintenance} en maintenance et ${report.disposed} sorti(s).`,
      `${report.movementCount} mouvement(s) enregistré(s) pendant la période. Valeur nette indicative à la clôture : ${amounts}.`,
      `Note : ${note}`,
      'Ouvrez le module Patrimoine pour consulter et imprimer le détail de l’état.',
    ].join(' ');

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: senderId },
        OR: [
          { isPlatformAdmin: true },
          { platformRole: UserRole.PLATFORM_MANAGING_PARTNER },
          {
            memberships: {
              some: {
                companyId,
                isActive: true,
                role: { in: [UserRole.MANAGING_PARTNER, UserRole.COMPANY_ADMIN] },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!recipients.length) {
      throw new NotFoundException(
        'Aucun Associé-Gérant ou administrateur actif ne peut recevoir cet état.',
      );
    }
    await this.prisma.notification.createMany({
      data: recipients.map(({ id: userId }) => ({
        companyId,
        userId,
        title: `État du patrimoine à examiner · ${report.period}`,
        message,
      })),
    });
    return { sent: recipients.length, period: report.period };
  }
}
