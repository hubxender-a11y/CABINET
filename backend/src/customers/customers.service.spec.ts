import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const customerId = 'c2c214d1-1f24-4df3-94fc-67c43e7ddf15';
  const companyId = '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';
  const transaction = {
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    customerDocument: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    customer: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    customerDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  let service: CustomersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    transaction.customer.findFirst.mockResolvedValue({ id: customerId });
    transaction.customer.update.mockResolvedValue({ id: customerId });
    transaction.customerDocument.create.mockResolvedValue({
      id: '601d6d3e-4128-4d58-a043-7a8084b0d1b6',
      name: 'contrat.pdf',
      mimeType: 'application/pdf',
      size: 8,
      createdAt: new Date('2026-11-04T10:00:00.000Z'),
    });
    transaction.customerDocument.delete.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});
    prisma.customer.findFirst.mockResolvedValue({ id: customerId });
    prisma.customerDocument.count.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    const module = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CustomersService);
  });

  it('excludes archived dossiers from the active client list', async () => {
    await service.list();
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        type: true,
        name: true,
        sector: true,
        contact: true,
        phone: true,
        email: true,
        address: true,
        nif: true,
        rccm: true,
        status: true,
        balance: true,
        createdAt: true,
      },
    });
  });

  it('archives a client and keeps its financial history', async () => {
    const result = await service.delete(customerId);

    expect(transaction.customer.findFirst).toHaveBeenCalledWith({
      where: { id: customerId, companyId, deletedAt: null },
      select: { id: true },
    });
    expect(transaction.customer.update).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId,
        action: 'CUSTOMER_DOSSIER_ARCHIVED',
        details: { customerId },
      },
    });
    expect(result.id).toBe(customerId);
  });

  it('clears optional client fields without throwing on null values', async () => {
    await service.update(customerId, {
      email: null,
      phone: null,
      address: null,
      nif: null,
      rccm: null,
    });

    expect(transaction.customer.update).toHaveBeenCalledWith({
      where: { id: customerId },
      data: {
        email: null,
        phone: null,
        address: null,
        nif: null,
        rccm: null,
      },
    });
  });

  it('updates the customer type and status', async () => {
    await service.update(customerId, {
      type: 'INDIVIDUAL',
      status: 'À relancer',
    });

    expect(transaction.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: customerId },
        data: { type: 'INDIVIDUAL', status: 'À relancer' },
      }),
    );
  });

  it('stores a validated PDF as a private customer document', async () => {
    const bytes = Buffer.from('%PDF-1.4');
    const result = await service.addDocument(customerId, {
      name: 'contrat.pdf',
      mimeType: 'application/pdf',
      data: bytes.toString('base64'),
    });

    expect(transaction.customerDocument.create).toHaveBeenCalledWith({
      data: {
        companyId,
        customerId,
        name: 'contrat.pdf',
        mimeType: 'application/pdf',
        size: bytes.length,
        data: Uint8Array.from(bytes),
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId,
        action: 'CUSTOMER_DOCUMENT_ADDED',
        details: {
          customerId,
          documentId: '601d6d3e-4128-4d58-a043-7a8084b0d1b6',
          name: 'contrat.pdf',
        },
      },
    });
    expect(result.id).toBe('601d6d3e-4128-4d58-a043-7a8084b0d1b6');
  });

  it('rejects a document whose content does not match its declared type', async () => {
    await expect(
      service.addDocument(customerId, {
        name: 'faux.pdf',
        mimeType: 'application/pdf',
        data: Buffer.from('not a PDF').toString('base64'),
      }),
    ).rejects.toThrow(
      'Le contenu du fichier ne correspond pas au format annoncé.',
    );

    expect(transaction.customerDocument.create).not.toHaveBeenCalled();
  });
});
