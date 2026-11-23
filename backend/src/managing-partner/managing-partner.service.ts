import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';

@Injectable()
export class ManagingPartnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentOrders: PaymentOrdersService,
  ) {}

  async overview() {
    const [companies, orders, invoicesByCompany, paymentsByCompany, recentActivity] =
      await Promise.all([
        this.prisma.company.findMany({
          orderBy: [{ tradeName: 'asc' }, { legalName: 'asc' }],
          select: {
            id: true,
            legalName: true,
            tradeName: true,
            logoUrl: true,
            currencyCode: true,
            _count: {
              select: {
                customers: true,
                invoices: true,
                payments: true,
                expenses: true,
                paymentOrders: true,
                cashVouchers: true,
              },
            },
          },
        }),
        this.paymentOrders.listAcrossCompanies(),
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
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            action: true,
            details: true,
            createdAt: true,
            company: { select: { id: true, legalName: true, tradeName: true } },
            user: { select: { name: true } },
          },
        }),
      ]);

    const companyRows = companies.map((company) => {
      const invoiceRows = invoicesByCompany
        .filter((row) => row.companyId === company.id)
        .map((row) => ({
          currency: row.currency,
          count: row._count._all,
          invoiced: row._sum.totalAmount?.toString() ?? '0',
          paid: row._sum.paidAmount?.toString() ?? '0',
        }));
      const paymentRows = paymentsByCompany
        .filter((row) => row.companyId === company.id)
        .map((row) => ({
          currency: row.currency,
          received: row._sum.amount?.toString() ?? '0',
        }));
      const companyOrders = orders.filter((order) => order.companyId === company.id);
      return {
        id: company.id,
        name: company.tradeName || company.legalName,
        legalName: company.legalName,
        logoUrl: company.logoUrl,
        currencyCode: company.currencyCode,
        counts: {
          clients: company._count.customers,
          invoices: company._count.invoices,
          payments: company._count.payments,
          expenses: company._count.expenses,
          paymentOrders: company._count.paymentOrders,
          pendingPaymentOrders: companyOrders.filter((order) =>
            order.status === 'SUBMITTED' || order.status === 'FINANCE_APPROVED',
          ).length,
          cashVouchers: company._count.cashVouchers,
        },
        invoicesByCurrency: invoiceRows,
        paymentsByCurrency: paymentRows,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        companies: companies.length,
        invoices: invoicesByCompany.reduce((total, row) => total + row._count._all, 0),
        pendingPaymentOrders: orders.filter((order) =>
          order.status === 'SUBMITTED' || order.status === 'FINANCE_APPROVED',
        ).length,
      },
      companies: companyRows,
      paymentOrders: orders,
      recentActivity: recentActivity.map((event) => ({
        id: event.id,
        action: event.action,
        details: event.details,
        createdAt: event.createdAt,
        company: {
          id: event.company.id,
          name: event.company.tradeName || event.company.legalName,
        },
        user: event.user,
      })),
    };
  }

  async companyDetails(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, legalName: true, tradeName: true, currencyCode: true },
    });
    if (!company) return null;

    const [accounts, movements, fundings, payments, unpaidInvoices, pendingVouchers, audit] =
      await Promise.all([
        this.prisma.cashAccount.findMany({
          where: { companyId },
          orderBy: [{ currency: 'asc' }, { code: 'asc' }],
          select: { id: true, code: true, name: true, currency: true, isActive: true },
        }),
        this.prisma.cashMovement.findMany({
          where: { companyId },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 200,
          include: { cashAccount: { select: { code: true, name: true, currency: true } } },
        }),
        this.prisma.cashMovement.findMany({
          where: { companyId, sourceType: 'CASH_FUNDING', direction: 'IN' },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 200,
          include: { cashAccount: { select: { code: true, name: true, currency: true } } },
        }),
        this.prisma.payment.findMany({
          where: { companyId, status: 'RECEIVED' },
          orderBy: { createdAt: 'desc' },
          take: 150,
          select: {
            id: true, amount: true, currency: true, method: true, reference: true,
            createdAt: true,
            customer: { select: { name: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        }),
        this.prisma.invoice.findMany({
          where: { companyId, fiscalStatus: { not: 'CANCELLED' } },
          orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }],
          take: 100,
          select: {
            id: true, invoiceNumber: true, issueDate: true, dueDate: true, currency: true,
            totalAmount: true, paidAmount: true,
            customer: { select: { name: true } },
          },
        }),
        this.prisma.cashVoucher.findMany({
          where: { companyId, status: { in: ['ISSUED', 'PENDING', 'SUBMITTED'] } },
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 100,
          select: { id: true, voucherNumber: true, date: true, beneficiary: true, category: true, amount: true, currency: true, status: true },
        }),
        this.prisma.auditLog.findMany({
          where: { companyId },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, action: true, details: true, createdAt: true, user: { select: { name: true } } },
        }),
      ]);

    const cashByAccount = await Promise.all(accounts.map(async (account) => {
      const [physical, provisioned] = await Promise.all([
        this.prisma.cashMovement.groupBy({
          by: ['direction'], where: { companyId, cashAccountId: account.id }, _sum: { amount: true },
        }),
        this.prisma.cashMovement.groupBy({
          by: ['direction', 'sourceType'],
          where: { companyId, cashAccountId: account.id, sourceType: { in: ['CASH_FUNDING', 'CASH_VOUCHER', 'CASH_VOUCHER_REVERSAL'] } },
          _sum: { amount: true },
        }),
      ]);
      const net = (rows: typeof physical) => rows.reduce((sum, row) => {
        const amount = row._sum.amount ?? new Prisma.Decimal(0);
        return row.direction === 'IN' ? sum.add(amount) : sum.sub(amount);
      }, new Prisma.Decimal(0));
      const provisionNet = provisioned.reduce((sum, row) => {
        const amount = row._sum.amount ?? new Prisma.Decimal(0);
        return row.direction === 'IN' ? sum.add(amount) : sum.sub(amount);
      }, new Prisma.Decimal(0));
      return { ...account, balance: net(physical).toString(), provisionAvailable: provisionNet.toString() };
    }));

    return {
      company: { id: company.id, name: company.tradeName || company.legalName, legalName: company.legalName, currencyCode: company.currencyCode },
      accounts: cashByAccount,
      cashMovements: movements.map((row) => ({ ...row, amount: row.amount.toString() })),
      fundings: fundings.map((row) => ({ ...row, amount: row.amount.toString() })),
      settlements: payments.map((row) => ({ ...row, amount: row.amount.toString() })),
      unpaidInvoices: unpaidInvoices
        .map((row) => ({ ...row, totalAmount: row.totalAmount.toString(), paidAmount: row.paidAmount.toString(), balanceDue: row.totalAmount.sub(row.paidAmount).toString() }))
        .filter((row) => Number(row.balanceDue) > 0),
      pendingCashVouchers: pendingVouchers.map((row) => ({ ...row, amount: row.amount.toString() })),
      activityJournal: audit,
      accountingNote: 'Le système ne stocke pas encore de journal général en partie double ni de plan comptable validé. Le livre de caisse et les règlements affichés sont des registres opérationnels issus des mouvements enregistrés.',
    };
  }
}
