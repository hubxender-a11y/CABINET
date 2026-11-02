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
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    customer: {
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
    transaction.auditLog.create.mockResolvedValue({});
    prisma.customer.findFirst.mockResolvedValue({ id: customerId });
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

  it('excludes archived dossiers from the active client list', () => {
    service.list();
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId, deletedAt: null }),
      }),
    );
  });

  it('archives a client and keeps its financial history', async () => {
    const result = await service.delete(customerId);

    expect(transaction.customer.findFirst).toHaveBeenCalledWith({
      where: { id: customerId, companyId, deletedAt: null },
      select: { id: true },
    });
    expect(transaction.customer.update).toHaveBeenCalledWith({
      where: { id: customerId },
      data: { deletedAt: expect.any(Date) },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CUSTOMER_DOSSIER_ARCHIVED',
          details: { customerId },
        }),
      }),
    );
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
});
