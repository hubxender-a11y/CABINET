import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ManagingPartnerService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string) {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        logoUrl: true,
        primaryColor: true,
        currencyCode: true,
        _count: {
          select: { memberships: true, customers: true, invoices: true, payments: true, expenses: true, paymentOrders: true, cashVouchers: true, purchases: true },
        },
      },
    });
    const companyIds = companies.map(({ id }) => id);
    if (!companyIds.length) return { companies: [], generatedAt: new Date().toISOString() };

    const [orders, unread, invoices, payments, fundings, accounts] = await Promise.all([
      this.prisma.paymentOrder.groupBy({
        by: ['companyId', 'status'], where: { companyId: { in: companyIds } }, _count: { _all: true },
      }),
      this.prisma.notification.groupBy({
        by: ['companyId'], where: { companyId: { in: companyIds }, userId, read: false }, _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['companyId', 'currency'], where: { companyId: { in: companyIds }, fiscalStatus: { not: 'CANCELLED' } },
        _sum: { totalAmount: true, paidAmount: true }, _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['companyId', 'currency'], where: { companyId: { in: companyIds }, status: 'RECEIVED' },
        _sum: { amount: true },
      }),
      this.prisma.cashMovement.groupBy({
        by: ['companyId', 'cashAccountId', 'direction'], where: { companyId: { in: companyIds }, sourceType: 'CASH_FUNDING' },
        _sum: { amount: true },
      }),
      this.prisma.cashAccount.findMany({
        where: { companyId: { in: companyIds } }, select: { id: true, companyId: true, currency: true, name: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      companies: companies.map((company) => {
        const companyOrders = orders.filter((row) => row.companyId === company.id);
        const fundingRows = fundings.filter((row) => row.companyId === company.id).map((row) => {
          const account = accounts.find(({ id }) => id === row.cashAccountId);
          return { direction: row.direction, amount: row._sum.amount?.toString() ?? '0', currency: account?.currency ?? company.currencyCode, accountName: account?.name ?? 'Caisse' };
        });
        return {
          id: company.id,
          name: company.tradeName || company.legalName,
          legalName: company.legalName,
          logoUrl: company.logoUrl,
          primaryColor: company.primaryColor,
          currencyCode: company.currencyCode,
          counts: {
            users: company._count.memberships,
            clients: company._count.customers,
            invoices: company._count.invoices,
            payments: company._count.payments,
            expenses: company._count.expenses,
            paymentOrders: company._count.paymentOrders,
            pendingPaymentOrders: companyOrders.filter(({ status }) => ['SUBMITTED', 'FINANCE_APPROVED'].includes(status)).reduce((sum, row) => sum + row._count._all, 0),
            cashVouchers: company._count.cashVouchers,
            purchases: company._count.purchases,
            unreadNotifications: unread.find(({ companyId }) => companyId === company.id)?._count._all ?? 0,
          },
          invoicesByCurrency: invoices.filter(({ companyId }) => companyId === company.id).map((row) => ({ currency: row.currency, count: row._count._all, invoiced: row._sum.totalAmount?.toString() ?? '0', paid: row._sum.paidAmount?.toString() ?? '0' })),
          paymentsByCurrency: payments.filter(({ companyId }) => companyId === company.id).map((row) => ({ currency: row.currency, received: row._sum.amount?.toString() ?? '0' })),
          fundingByAccount: fundingRows,
        };
      }),
    };
  }
}
