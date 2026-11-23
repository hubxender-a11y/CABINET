import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const trackedCompanyCounts = {
  memberships: true,
  customers: true,
  invoices: true,
  payments: true,
  expenses: true,
  paymentOrders: true,
  cashVouchers: true,
  archiveDocuments: true,
  auditLogs: true,
} as const;

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async assignManagingPartner(email: string, grantedBy: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        memberships: {
          select: { companyId: true, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Aucun compte existant ne correspond à cette adresse e-mail.');
    }
    if (!user.isActive) {
      throw new ConflictException('Ce compte est désactivé. Réactivez-le avant de lui attribuer cet accès.');
    }
    if (user.memberships.some(({ role }) => role === UserRole.PLATFORM_SUPER_ADMIN)) {
      throw new ConflictException('Ce compte est déjà super-admin de la plateforme.');
    }

    const companyId = user.memberships[0]?.companyId;
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { platformRole: UserRole.PLATFORM_MANAGING_PARTNER },
      });
      if (companyId) {
        await transaction.auditLog.create({
          data: {
            companyId,
            userId: grantedBy,
            action: 'PLATFORM_MANAGING_PARTNER_GRANTED',
            details: { targetUserId: user.id, email: user.email },
          },
        });
      }
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: UserRole.PLATFORM_MANAGING_PARTNER,
      message: 'Accès associé-gérant global activé.',
    };
  }

  async overview() {
    const kinshasaDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kinshasa',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const kinshasaDate = (type: string) =>
      kinshasaDateParts.find((part) => part.type === type)?.value ?? '00';
    const today = new Date(
      `${kinshasaDate('year')}-${kinshasaDate('month')}-${kinshasaDate('day')}T00:00:00+01:00`,
    );

    const [
      companies,
      invoiceTotals,
      paymentTotals,
      orderStatuses,
      recentActivity,
      activityToday,
      userCount,
    ] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
        select: {
          id: true,
          legalName: true,
          tradeName: true,
          logoUrl: true,
          currencyCode: true,
          createdAt: true,
          subscription: {
            select: { plan: true, status: true, endAt: true },
          },
          _count: { select: trackedCompanyCounts },
        },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId', 'currency'],
        _sum: { totalAmount: true, paidAmount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['companyId', 'currency'],
        where: { status: 'RECEIVED' },
        _sum: { amount: true },
      }),
      this.prisma.paymentOrder.groupBy({
        by: ['companyId', 'status'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          company: { select: { id: true, legalName: true, tradeName: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.auditLog.groupBy({
        by: ['companyId'],
        where: { createdAt: { gte: today } },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);

    const invoicesByCompany = new Map<string, typeof invoiceTotals>();
    for (const row of invoiceTotals) {
      const rows = invoicesByCompany.get(row.companyId) ?? [];
      rows.push(row);
      invoicesByCompany.set(row.companyId, rows);
    }

    const paymentsByCompany = new Map<string, typeof paymentTotals>();
    for (const row of paymentTotals) {
      const rows = paymentsByCompany.get(row.companyId) ?? [];
      rows.push(row);
      paymentsByCompany.set(row.companyId, rows);
    }

    const ordersByCompany = new Map<string, typeof orderStatuses>();
    for (const row of orderStatuses) {
      const rows = ordersByCompany.get(row.companyId) ?? [];
      rows.push(row);
      ordersByCompany.set(row.companyId, rows);
    }

    const activityByCompany = new Map(
      activityToday.map((row) => [row.companyId, row._count._all]),
    );

    const companyRows = companies.map((company) => ({
      id: company.id,
      name: company.tradeName || company.legalName,
      legalName: company.legalName,
      logoUrl: company.logoUrl,
      currencyCode: company.currencyCode,
      createdAt: company.createdAt,
      subscription: company.subscription,
      counts: {
        users: company._count.memberships,
        clients: company._count.customers,
        invoices: company._count.invoices,
        payments: company._count.payments,
        expenses: company._count.expenses,
        paymentOrders: company._count.paymentOrders,
        pendingPaymentOrders: (ordersByCompany.get(company.id) ?? [])
          .filter(
            (row) =>
              row.status === 'SUBMITTED' || row.status === 'FINANCE_APPROVED',
          )
          .reduce((sum, row) => sum + row._count._all, 0),
        cashVouchers: company._count.cashVouchers,
        archiveDocuments: company._count.archiveDocuments,
        auditEvents: company._count.auditLogs,
        activityToday: activityByCompany.get(company.id) ?? 0,
      },
      invoicesByCurrency: (invoicesByCompany.get(company.id) ?? []).map(
        (row) => ({
          currency: row.currency,
          count: row._count._all,
          invoiced: row._sum.totalAmount?.toString() ?? '0',
          paid: row._sum.paidAmount?.toString() ?? '0',
        }),
      ),
      paymentsByCurrency: (paymentsByCompany.get(company.id) ?? []).map(
        (row) => ({
          currency: row.currency,
          received: row._sum.amount?.toString() ?? '0',
        }),
      ),
    }));

    const totalsByCurrency = new Map<
      string,
      { invoices: number; paidInvoices: number; payments: number }
    >();
    for (const row of invoiceTotals) {
      const totals = totalsByCurrency.get(row.currency) ?? {
        invoices: 0,
        paidInvoices: 0,
        payments: 0,
      };
      totals.invoices += Number(row._sum.totalAmount ?? 0);
      totals.paidInvoices += Number(row._sum.paidAmount ?? 0);
      totalsByCurrency.set(row.currency, totals);
    }
    for (const row of paymentTotals) {
      const totals = totalsByCurrency.get(row.currency) ?? {
        invoices: 0,
        paidInvoices: 0,
        payments: 0,
      };
      totals.payments += Number(row._sum.amount ?? 0);
      totalsByCurrency.set(row.currency, totals);
    }

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        companies: companies.length,
        activeUsers: userCount,
        invoices: invoiceTotals.reduce((sum, row) => sum + row._count._all, 0),
        pendingPaymentOrders: companyRows.reduce(
          (sum, company) => sum + company.counts.pendingPaymentOrders,
          0,
        ),
        activityToday: activityToday.reduce(
          (sum, row) => sum + row._count._all,
          0,
        ),
        totalsByCurrency: [...totalsByCurrency.entries()].map(
          ([currency, totals]) => ({
            currency,
            ...Object.fromEntries(
              Object.entries(totals).map(([key, value]) => [
                key,
                value.toFixed(2),
              ]),
            ),
          }),
        ),
      },
      companies: companyRows,
      recentActivity: recentActivity.map((event) => ({
        ...event,
        company: {
          id: event.company.id,
          name: event.company.tradeName || event.company.legalName,
        },
      })),
    };
  }
}
