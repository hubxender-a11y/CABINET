import { Injectable } from '@nestjs/common';
import { FiscalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';

const kinshasaDayStart = (date: Date) => {
  const localKinshasa = new Date(date.getTime() + 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      localKinshasa.getUTCFullYear(),
      localKinshasa.getUTCMonth(),
      localKinshasa.getUTCDate(),
    ) -
      60 * 60 * 1000,
  );
};

const kinshasaDate = (date: Date) =>
  new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);

const moneyString = (value: { toString(): string } | null | undefined) =>
  value?.toString() ?? '0.00';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthlyReport(period: string) {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1) - 60 * 60 * 1000);
    const end = new Date(Date.UTC(year, month, 1) - 60 * 60 * 1000);
    const companyId = getCompanyId();

    const [invoices, payments, expenses] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, issueDate: { gte: start, lt: end } },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: [{ issueDate: 'asc' }, { invoiceNumber: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'RECEIVED',
          createdAt: { gte: start, lt: end },
        },
        include: {
          invoice: { select: { id: true, invoiceNumber: true } },
          customer: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.expense.findMany({
        where: { companyId, date: { gte: start, lt: end } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      period,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customer: invoice.customer,
        totalAmount: invoice.totalAmount.toString(),
        paidAmount: invoice.paidAmount.toString(),
        currency: invoice.currency,
        fiscalStatus: invoice.fiscalStatus,
        issueDate: kinshasaDate(invoice.issueDate),
      })),
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toString(),
        currency: payment.currency,
        createdAt: payment.createdAt.toISOString(),
        invoice: payment.invoice,
        customer: payment.customer,
      })),
      expenses: expenses.map((expense) => ({
        id: expense.id,
        category: expense.category,
        date: kinshasaDate(expense.date),
        amount: expense.amount.toString(),
        currency: expense.currency,
        description: expense.description,
      })),
    };
  }

  async getOverview() {
    const companyId = getCompanyId();
    const todayStart = kinshasaDayStart(new Date());
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const monthStart = new Date(
      Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth()) -
        60 * 60 * 1000,
    );
    const validInvoiceWhere = {
      companyId,
      fiscalStatus: {
        notIn: [FiscalStatus.DRAFT, FiscalStatus.REJECTED],
      },
    };

    const [
      invoiceCount,
      certifiedCount,
      pendingFiscalizationCount,
      rejectedCount,
      monthRevenue,
      todayRevenue,
      balances,
      paymentTotals,
      expenseTotals,
      customerCount,
      followUpCount,
      recentInvoices,
      attentionCustomers,
    ] = await Promise.all([
      this.prisma.invoice.count({ where: { companyId } }),
      this.prisma.invoice.count({
        where: { companyId, fiscalStatus: FiscalStatus.CERTIFIED },
      }),
      this.prisma.invoice.count({
        where: {
          companyId,
          fiscalStatus: FiscalStatus.PENDING_FISCALIZATION,
        },
      }),
      this.prisma.invoice.count({
        where: { companyId, fiscalStatus: FiscalStatus.REJECTED },
      }),
      this.prisma.invoice.groupBy({
        by: ['currency'],
        where: { ...validInvoiceWhere, issueDate: { gte: monthStart } },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['currency'],
        where: {
          ...validInvoiceWhere,
          issueDate: { gte: todayStart, lt: tomorrowStart },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['currency'],
        where: validInvoiceWhere,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: {
          companyId,
          status: 'RECEIVED',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['currency'],
        where: { companyId, date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.customer.count({ where: { companyId } }),
      this.prisma.customer.count({
        where: { companyId, status: { in: ['À relancer', 'En retard'] } },
      }),
      this.prisma.invoice.findMany({
        where: { companyId },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { issueDate: 'desc' },
        take: 8,
      }),
      this.prisma.customer.findMany({
        where: {
          companyId,
          status: { in: ['À relancer', 'En retard'] },
        },
        select: { id: true, name: true, sector: true, status: true },
        orderBy: { name: 'asc' },
        take: 6,
      }),
    ]);

    const asCurrencyMap = <T extends { currency: string }>(
      rows: T[],
      getAmount: (row: T) => string,
    ) => new Map(rows.map((row) => [row.currency, getAmount(row)]));
    const monthRevenueByCurrency = asCurrencyMap(monthRevenue, (row) =>
      moneyString(row._sum.totalAmount),
    );
    const todayRevenueByCurrency = asCurrencyMap(todayRevenue, (row) =>
      moneyString(row._sum.totalAmount),
    );
    const paymentByCurrency = asCurrencyMap(paymentTotals, (row) =>
      moneyString(row._sum.amount),
    );
    const expenseByCurrency = asCurrencyMap(expenseTotals, (row) =>
      moneyString(row._sum.amount),
    );
    const receivableByCurrency = new Map(
      balances.map((row) => [
        row.currency,
        new Prisma.Decimal(row._sum.totalAmount ?? 0)
          .sub(row._sum.paidAmount ?? 0)
          .toString(),
      ]),
    );
    const currencies = new Set([
      ...monthRevenueByCurrency.keys(),
      ...todayRevenueByCurrency.keys(),
      ...paymentByCurrency.keys(),
      ...expenseByCurrency.keys(),
      ...receivableByCurrency.keys(),
    ]);

    return {
      period: {
        start: monthStart.toISOString(),
        end: new Date().toISOString(),
        timezone: 'Africa/Kinshasa',
      },
      summary: {
        customerCount,
        invoicesIssued: invoiceCount,
        certifiedInvoices: certifiedCount,
        pendingCertification: pendingFiscalizationCount,
        rejectedInvoices: rejectedCount,
        followUpCount,
      },
      moneyByCurrency: [...currencies].sort().map((currency) => ({
        currency,
        revenueToday: todayRevenueByCurrency.get(currency) ?? '0.00',
        revenueMonth: monthRevenueByCurrency.get(currency) ?? '0.00',
        receivables: receivableByCurrency.get(currency) ?? '0.00',
        cashCollectedMonth: paymentByCurrency.get(currency) ?? '0.00',
        expensesMonth: expenseByCurrency.get(currency) ?? '0.00',
      })),
      recentInvoices: recentInvoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.invoiceNumber,
        clientId: invoice.customer.id,
        client: invoice.customer.name,
        amount: invoice.totalAmount.toString(),
        currency: invoice.currency,
        fiscalStatus: invoice.fiscalStatus,
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
      })),
      attentionCustomers,
    };
  }
}
