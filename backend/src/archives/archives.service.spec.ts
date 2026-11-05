import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ArchivesService } from './archives.service';

describe('ArchivesService', () => {
  const companyId = '5eecf1f8-a90e-4e8f-a01b-6eaa7a7c8e20';
  const userId = 'e56fd2ab-26a6-45f1-b13f-c54dd8cc5a0e';
  const documentId = '0b5c53e2-9338-4dcf-aa3b-11c1a8da4f42';
  const transaction = {
    archiveDocument: {
      create: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    archiveBinder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    archiveDocument: { findMany: jest.fn(), findFirst: jest.fn() },
    archiveBinder: { findMany: jest.fn(), findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: ArchivesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    transaction.archiveDocument.create.mockResolvedValue({
      id: documentId,
      title: 'Déclaration',
      originalName: 'declaration.pdf',
      size: 8,
    });
    transaction.archiveDocument.findFirst.mockResolvedValue({
      id: documentId,
      title: 'Déclaration',
    });
    transaction.archiveDocument.updateMany.mockResolvedValue({ count: 1 });
    transaction.archiveDocument.count.mockResolvedValue(0);
    transaction.archiveDocument.delete.mockResolvedValue({});
    transaction.archiveBinder.create.mockResolvedValue({
      id: '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe',
      name: 'Fiscalité annuelle',
      category: 'FISCAL',
      fiscalYear: 2026,
      period: '',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    transaction.archiveBinder.findFirst.mockResolvedValue({
      id: '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe',
      name: 'Fiscalité annuelle',
    });
    transaction.archiveBinder.delete.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});
    service = new ArchivesService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists only metadata within the authenticated cabinet', async () => {
    await service.list({ fiscalYear: 2026 }, companyId);
    expect(prisma.archiveDocument.findMany).toHaveBeenCalledWith({
      where: {
        companyId,
        fiscalYear: 2026,
        deletedAt: null,
      },
      select: {
        id: true,
        customerId: true,
        binderId: true,
        category: true,
        binder: true,
        fiscalYear: true,
        period: true,
        title: true,
        originalName: true,
        mimeType: true,
        size: true,
        documentDate: true,
        description: true,
        deletedAt: true,
        createdAt: true,
        customer: { select: { id: true, name: true } },
        archiveBinder: {
          select: {
            id: true,
            name: true,
            category: true,
            fiscalYear: true,
            period: true,
          },
        },
      },
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  });

  it('stores a PDF with its bytes, cabinet scope and actor audit', async () => {
    const bytes = Buffer.from('%PDF-1.7');
    await service.create(
      {
        category: 'ACCOUNTING',
        fiscalYear: 2026,
        title: 'Déclaration',
        originalName: 'declaration.pdf',
        mimeType: 'application/pdf',
        data: bytes.toString('base64'),
      },
      companyId,
      userId,
    );

    expect(transaction.archiveDocument.create).toHaveBeenCalledWith({
      data: {
        companyId,
        customerId: undefined,
        category: 'ACCOUNTING',
        binder: null,
        fiscalYear: 2026,
        period: null,
        title: 'Déclaration',
        originalName: 'declaration.pdf',
        mimeType: 'application/pdf',
        size: bytes.length,
        documentDate: null,
        description: null,
        data: bytes,
      },
      select: { id: true, title: true, originalName: true, size: true },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        companyId,
        userId,
        action: 'ARCHIVE_DOCUMENT_CREATED',
        details: {
          documentId,
          title: 'Déclaration',
          originalName: 'declaration.pdf',
          size: bytes.length,
          category: 'ACCOUNTING',
          fiscalYear: 2026,
        },
      },
    });
  });

  it('links a document only to a binder in the same company, category and year', async () => {
    const binderId = '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe';
    const bytes = Buffer.from('%PDF-1.7');
    prisma.archiveBinder.findFirst.mockResolvedValueOnce({ id: binderId });

    await service.create(
      {
        category: 'FISCAL',
        fiscalYear: 2026,
        binderId,
        title: 'Déclaration',
        originalName: 'declaration.pdf',
        mimeType: 'application/pdf',
        data: bytes.toString('base64'),
      },
      companyId,
      userId,
    );

    expect(prisma.archiveBinder.findFirst).toHaveBeenCalledWith({
      where: { id: binderId, companyId, category: 'FISCAL', fiscalYear: 2026 },
      select: { id: true },
    });
    expect(transaction.archiveDocument.create).toHaveBeenCalledWith({
      data: {
        companyId,
        customerId: undefined,
        binderId,
        category: 'FISCAL',
        binder: null,
        fiscalYear: 2026,
        period: null,
        title: 'Déclaration',
        originalName: 'declaration.pdf',
        mimeType: 'application/pdf',
        size: bytes.length,
        documentDate: null,
        description: null,
        data: bytes,
      },
      select: { id: true, title: true, originalName: true, size: true },
    });
  });

  it('rejects a binder that is not available in the authenticated company', async () => {
    const binderId = '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe';
    prisma.archiveBinder.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          category: 'FISCAL',
          fiscalYear: 2026,
          binderId,
          title: 'Déclaration',
          originalName: 'declaration.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('%PDF-1.7').toString('base64'),
        },
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.archiveBinder.findFirst).toHaveBeenCalledWith({
      where: { id: binderId, companyId, category: 'FISCAL', fiscalYear: 2026 },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects mismatched file extensions and contents before storage', async () => {
    await expect(
      service.create(
        {
          category: 'INTERNAL',
          fiscalYear: 2026,
          title: 'Document',
          originalName: 'document.png',
          mimeType: 'image/png',
          data: Buffer.from('%PDF-1.7').toString('base64'),
        },
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects blank document titles before storage', async () => {
    await expect(
      service.create(
        {
          category: 'INTERNAL',
          fiscalYear: 2026,
          title: '   ',
          originalName: 'document.pdf',
          mimeType: 'application/pdf',
          data: Buffer.from('%PDF-1.7').toString('base64'),
        },
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('soft-deletes and restores documents with company-scoped audit logs', async () => {
    const deletedAt = new Date('2026-11-05T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(deletedAt);
    await service.softDelete(documentId, companyId, userId);
    expect(transaction.archiveDocument.updateMany).toHaveBeenCalledWith({
      where: { id: documentId, companyId, deletedAt: null },
      data: { deletedAt },
    });
    await service.restore(documentId, companyId, userId);
    expect(transaction.archiveDocument.updateMany).toHaveBeenLastCalledWith({
      where: { id: documentId, companyId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('creates a company-scoped binder and records it in the audit log', async () => {
    const result = await service.createBinder(
      {
        name: '  Fiscalité annuelle  ',
        category: 'FISCAL',
        fiscalYear: 2026,
      },
      companyId,
      userId,
    );

    expect(transaction.archiveBinder.create).toHaveBeenCalledWith({
      data: {
        companyId,
        name: 'Fiscalité annuelle',
        category: 'FISCAL',
        fiscalYear: 2026,
        period: '',
      },
      select: {
        id: true,
        name: true,
        category: true,
        fiscalYear: true,
        period: true,
        createdAt: true,
      },
    });
    expect(transaction.auditLog.create).toHaveBeenLastCalledWith({
      data: {
        companyId,
        userId,
        action: 'ARCHIVE_BINDER_CREATED',
        details: {
          binderId: result.id,
          name: 'Fiscalité annuelle',
          category: 'FISCAL',
          fiscalYear: 2026,
          period: '',
        },
      },
    });
    expect(result.documentCount).toBe(0);
  });

  it('refuses to delete a binder containing documents, including trashed ones', async () => {
    transaction.archiveDocument.count.mockResolvedValue(1);

    await expect(
      service.deleteBinder(
        '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe',
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.archiveDocument.count).toHaveBeenCalledWith({
      where: {
        companyId,
        binderId: '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe',
      },
    });
    expect(transaction.archiveBinder.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty binder and records the company-scoped audit log', async () => {
    const binderId = '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe';
    await expect(
      service.deleteBinder(binderId, companyId, userId),
    ).resolves.toEqual({ id: binderId, deleted: true });

    expect(transaction.archiveBinder.findFirst).toHaveBeenCalledWith({
      where: { id: binderId, companyId },
      select: { id: true, name: true },
    });
    expect(transaction.archiveBinder.delete).toHaveBeenCalledWith({
      where: { id: binderId },
    });
    expect(transaction.auditLog.create).toHaveBeenLastCalledWith({
      data: {
        companyId,
        userId,
        action: 'ARCHIVE_BINDER_DELETED',
        details: { binderId, name: 'Fiscalité annuelle' },
      },
    });
  });

  it('does not delete a binder outside the authenticated company', async () => {
    transaction.archiveBinder.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.deleteBinder(
        '84f82ac4-c1e8-4d5b-bab0-e2f35f0496fe',
        companyId,
        userId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.archiveBinder.delete).not.toHaveBeenCalled();
  });
});
