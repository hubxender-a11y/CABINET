import { InvoicesService } from './invoices.service';
import { getCompanyId } from '../database/company-context';

describe('InvoicesService', () => {
  it('casts the advisory-lock year to PostgreSQL integer for the two-key lock', async () => {
    const rawQueries: { sql: string; values: unknown[] }[] = [];
    const queryRaw = (strings: TemplateStringsArray, ...values: unknown[]) => {
      rawQueries.push({ sql: strings.join(''), values });
      return Promise.resolve([]);
    };
    const createdInvoice = {
      id: 'invoice-id',
      invoiceNumber: '001/2026',
      items: [],
    };
    const transaction = {
      $queryRaw: queryRaw,
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ exchangeRateCdfPerUsd: null }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(createdInvoice),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-id' }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new InvoicesService(prisma as never);

    await service.create({
      customerId: 'customer-id',
      fiscalStatus: 'PENDING_FISCALIZATION',
      period: '2026',
      concern: 'Prestation',
      madeAt: 'Kinshasa',
      issueDate: '2026-11-02',
      currency: 'CDF',
      items: [{ rubric: 'Honoraires', quantity: 1, unitPrice: '10.00' }],
    });

    expect(rawQueries[0].sql).toContain('pg_advisory_xact_lock(hashtext(');
    expect(rawQueries[0].sql).toContain('CAST(');
    expect(rawQueries[0].sql).toContain('AS INTEGER))');
    expect(rawQueries[0].values).toEqual([getCompanyId(), 2026]);
  });
});
