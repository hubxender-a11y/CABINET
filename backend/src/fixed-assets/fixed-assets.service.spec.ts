import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FixedAssetsService } from './fixed-assets.service';

describe('FixedAssetsService', () => {
  const companyId = '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';
  const userId = 'e56fd2ab-26a6-45f1-b13f-c54dd8cc5a0e';
  const assetId = '0b5c53e2-9338-4dcf-aa3b-11c1a8da4f42';
  const asset = {
    id: assetId,
    companyId,
    assetNumber: 'MAT-001',
    name: 'Ordinateur',
    category: 'Informatique',
    serialNumber: null,
    acquiredAt: new Date('2025-01-15T00:00:00.000Z'),
    acquisitionCost: '1200.00',
    residualValue: '200.00',
    usefulLifeMonths: 10,
    currency: 'USD',
    status: 'ACTIVE',
    assignedTo: null,
    location: null,
    notes: null,
    movements: [],
  };
  const transaction = {
    fixedAsset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    fixedAssetMovement: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    fixedAsset: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: FixedAssetsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    transaction.fixedAsset.create.mockResolvedValue(asset);
    transaction.fixedAsset.findFirst.mockResolvedValue(asset);
    transaction.fixedAsset.updateMany.mockResolvedValue({ count: 1 });
    transaction.fixedAssetMovement.create.mockResolvedValue({
      id: 'movement-id',
      movementType: 'ASSIGNMENT',
    });
    transaction.fixedAssetMovement.findFirst.mockResolvedValue(null);
    transaction.auditLog.create.mockResolvedValue({});
    service = new FixedAssetsService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scopes the register by company and calculates capped linear depreciation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-07-15T12:00:00.000Z'));
    prisma.fixedAsset.findMany.mockResolvedValue([asset]);

    const result = await service.list(companyId);

    expect(prisma.fixedAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId } }),
    );
    expect(result[0].accumulatedDepreciation.toString()).toBe('600');
    expect(result[0].netBookValue.toString()).toBe('600');
    jest.useRealTimers();
  });

  it('rejects a residual value greater than acquisition cost', async () => {
    await expect(
      service.create(
        {
          assetNumber: 'MAT-002',
          name: 'Écran',
          category: 'Informatique',
          acquiredAt: '2025-01-01',
          acquisitionCost: '100.00',
          residualValue: '120.00',
          usefulLifeMonths: 60,
          currency: 'CDF',
        },
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records asset creation and its initial movement in the company audit trail', async () => {
    await service.create(
      {
        assetNumber: 'MAT-001',
        name: 'Ordinateur',
        category: 'Informatique',
        acquiredAt: '2025-01-15',
        acquisitionCost: '1200.00',
        residualValue: '200.00',
        usefulLifeMonths: 60,
        currency: 'USD',
      },
      companyId,
      userId,
    );

    expect(transaction.fixedAsset.create).toHaveBeenCalledWith({
      data: {
        companyId,
        assetNumber: 'MAT-001',
        name: 'Ordinateur',
        category: 'Informatique',
        serialNumber: null,
        acquiredAt: new Date('2025-01-15T00:00:00.000Z'),
        acquisitionCost: new Prisma.Decimal('1200.00'),
        residualValue: new Prisma.Decimal('200.00'),
        usefulLifeMonths: 60,
        currency: 'USD',
        assignedTo: null,
        location: null,
        notes: null,
      },
    });
    expect(transaction.fixedAssetMovement.create).toHaveBeenCalledWith({
      data: {
        companyId,
        assetId,
        movementType: 'ACQUISITION',
        movementDate: new Date('2025-01-15T00:00:00.000Z'),
        toAssignee: null,
        toLocation: null,
        description: 'Enregistrement initial du bien.',
      },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId,
        userId,
        action: 'FIXED_ASSET_CREATED',
        details: {
          assetId,
          assetNumber: 'MAT-001',
          acquisitionCost: '1200',
          currency: 'USD',
        },
      },
    });
  });

  it('records an assignment and rejects moves for assets outside the company', async () => {
    await service.addMovement(
      assetId,
      { movementType: 'ASSIGNMENT', assignedTo: 'Aline' },
      companyId,
      userId,
    );
    expect(transaction.fixedAsset.updateMany).toHaveBeenCalledWith({
      where: { id: assetId, companyId, status: { not: 'DISPOSED' } },
      data: { assignedTo: 'Aline', location: null, status: 'ACTIVE' },
    });

    transaction.fixedAsset.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.addMovement(
        assetId,
        { movementType: 'ASSIGNMENT', assignedTo: 'Aline' },
        companyId,
        userId,
      ),
    ).rejects.toThrow('Bien patrimonial introuvable.');
  });
});
