import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
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

  it('deletes an uncertified invoice and updates other invoice balances', async () => {
    const companyId = getCompanyId();
    const targetInvoice = {
      id: 'target-invoice',
      invoiceNumber: '015/2026',
      issueDate: new Date('2026-10-15T12:00:00.000Z'),
      customerId: 'customer-id',
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(25),
      currency: 'CDF',
      fiscalStatus: 'DRAFT',
      isCertified: false,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ issueDate: targetInvoice.issueDate })
          .mockResolvedValueOnce(targetInvoice),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'other-invoice',
            paidAmount: new Prisma.Decimal(30),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'payment-id',
            invoiceId: targetInvoice.id,
            amount: new Prisma.Decimal(25),
            allocations: [
              {
                invoiceId: targetInvoice.id,
                amount: new Prisma.Decimal(25),
              },
              {
                invoiceId: 'other-invoice',
                amount: new Prisma.Decimal(10),
              },
            ],
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      creditNote: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      invoiceTax: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      invoiceItem: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      fiscalTransaction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      fiscalTransmissionLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new InvoicesService(prisma as never);

    await expect(service.delete(targetInvoice.id)).resolves.toEqual({
      id: targetInvoice.id,
      deletedPaymentIds: ['payment-id'],
    });
    expect(transaction.payment.deleteMany).toHaveBeenCalledWith({
      where: { companyId, id: { in: ['payment-id'] } },
    });
    expect(transaction.invoice.update).toHaveBeenCalledWith({
      where: { id: 'other-invoice' },
      data: { paidAmount: new Prisma.Decimal(20) },
    });
    expect(transaction.creditNote.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: targetInvoice.id },
    });
    expect(transaction.invoice.deleteMany).toHaveBeenCalledWith({
      where: { id: targetInvoice.id, companyId },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId,
        action: 'INVOICE_PERMANENTLY_DELETED',
        details: {
          invoiceId: targetInvoice.id,
          invoiceNumber: targetInvoice.invoiceNumber,
          customerId: targetInvoice.customerId,
          total: '100',
          paidAmount: '25',
          currency: 'CDF',
          fiscalStatus: 'DRAFT',
          isCertified: false,
          deletedPaymentCount: 1,
          deletedCreditNoteCount: 1,
          deletedTaxCount: 2,
          deletedItemCount: 3,
          deletedFiscalTransactionCount: 2,
        },
      },
    });
  });

  it('does not delete a certified invoice or any of its records', async () => {
    const certifiedInvoice = {
      id: 'certified-invoice',
      invoiceNumber: '016/2026',
      issueDate: new Date('2026-10-15T12:00:00.000Z'),
      customerId: 'customer-id',
      totalAmount: new Prisma.Decimal(100),
      paidAmount: new Prisma.Decimal(25),
      currency: 'CDF',
      fiscalStatus: 'CERTIFIED',
      isCertified: true,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ issueDate: certifiedInvoice.issueDate })
          .mockResolvedValueOnce(certifiedInvoice),
        findMany: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      payment: { findMany: jest.fn(), deleteMany: jest.fn() },
      creditNote: { deleteMany: jest.fn() },
      invoiceTax: { deleteMany: jest.fn() },
      invoiceItem: { deleteMany: jest.fn() },
      fiscalTransaction: { deleteMany: jest.fn() },
      fiscalTransmissionLog: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new InvoicesService(prisma as never);

    await expect(service.delete(certifiedInvoice.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.payment.findMany).not.toHaveBeenCalled();
    expect(transaction.invoice.deleteMany).not.toHaveBeenCalled();
    expect(transaction.fiscalTransaction.deleteMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('reserves invoice numbers recorded in permanent-deletion audit logs', async () => {
    const createdInvoiceNumbers: string[] = [];
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ exchangeRateCdfPerUsd: null }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([{ invoiceNumber: '001/2026' }]),
        create: jest.fn(({ data }: { data: { invoiceNumber: string } }) => {
          createdInvoiceNumbers.push(data.invoiceNumber);
          return {
            id: 'invoice-id',
            invoiceNumber: data.invoiceNumber,
            items: [],
          };
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest
          .fn()
          .mockResolvedValue([{ details: { invoiceNumber: '002/2026' } }]),
      },
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
      fiscalStatus: 'DRAFT',
      period: '2026',
      concern: 'Prestation',
      madeAt: 'Kinshasa',
      issueDate: '2026-11-02',
      currency: 'CDF',
      items: [{ rubric: 'Honoraires', quantity: 1, unitPrice: '10.00' }],
    });

    expect(createdInvoiceNumbers).toEqual(['003/2026']);
  });
});
