import { Injectable } from '@nestjs/common';
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

  async activities(pageValue?: string, pageSizeValue?: string, companyId?: string) {
    const parsedPage = Number.parseInt(pageValue ?? '1', 10);
    const parsedPageSize = Number.parseInt(pageSizeValue ?? '10', 10);
    const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const pageSize = Number.isFinite(parsedPageSize)
      ? Math.min(50, Math.max(5, parsedPageSize))
      : 10;
    const where = companyId ? { companyId } : undefined;
    const [totalCount, events] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          company: { select: { id: true, legalName: true, tradeName: true } },
          user: { select: { name: true, email: true } },
        },
      }),
    ]);

    return {
      items: events.map((event) => ({
        ...event,
        company: {
          id: event.company.id,
          name: event.company.tradeName || event.company.legalName,
        },
      })),
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  async users(companyId?: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ company: { legalName: 'asc' } }, { user: { name: 'asc' } }],
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        company: { select: { id: true, legalName: true, tradeName: true, isActive: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            isPlatformAdmin: true,
            createdAt: true,
          },
        },
      },
    });
    return memberships.map((membership) => ({
      ...membership.user,
      membershipId: membership.id,
      role: membership.role,
      isActive: membership.isActive && membership.user.isActive,
      joinedAt: membership.createdAt,
      company: {
        id: membership.company.id,
        name: membership.company.tradeName || membership.company.legalName,
        isActive: membership.company.isActive,
      },
    }));
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
          primaryColor: true,
          accentColor: true,
          email: true,
          city: true,
          isActive: true,
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
      this.prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
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

    const companyRows = companies.map((company) => ({
      id: company.id,
      name: company.tradeName || company.legalName,
      legalName: company.legalName,
      logoUrl: company.logoUrl,
      primaryColor: company.primaryColor,
      accentColor: company.accentColor,
      email: company.email,
      city: company.city,
      isActive: company.isActive,
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
        activityToday,
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
    };
  }
}
