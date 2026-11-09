import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  ArchiveBinderListQueryDto,
  ArchiveListQueryDto,
  CreateArchiveBinderDto,
  CreateArchiveDocumentDto,
  UpdateArchivePinsDto,
} from './archives.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedExtensions: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
};

function metadataWhere(
  companyId: string,
  query: ArchiveListQueryDto,
  deleted: boolean,
): Prisma.ArchiveDocumentWhereInput {
  const search = query.q?.trim();
  return {
    companyId,
    deletedAt: deleted ? { not: null } : null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
    ...(query.binderId ? { binderId: query.binderId } : {}),
    ...(query.pinnedOnly === 'true' ? { isPinned: true } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { originalName: { contains: search, mode: 'insensitive' } },
            { binder: { contains: search, mode: 'insensitive' } },
            {
              archiveBinder: {
                is: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { personName: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
            { period: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { personName: { contains: search, mode: 'insensitive' } },
            {
              customer: {
                is: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
            },
          ],
        }
      : {}),
  };
}

@Injectable()
export class ArchivesService {
  constructor(private readonly prisma: PrismaService) {}

  async listBinders(query: ArchiveBinderListQueryDto, companyId: string) {
    const binders = await this.prisma.archiveBinder.findMany({
      where: {
        companyId,
        ...(query.category ? { category: query.category } : {}),
        ...(query.fiscalYear ? { fiscalYear: query.fiscalYear } : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        personName: true,
        fiscalYear: true,
        period: true,
        createdAt: true,
        _count: { select: { documents: true } },
      },
      orderBy: [
        { fiscalYear: 'desc' },
        { category: 'asc' },
        { period: 'asc' },
        { name: 'asc' },
      ],
    });
    return binders.map(({ _count, ...binder }) => ({
      ...binder,
      documentCount: _count.documents,
    }));
  }

  async createBinder(
    dto: CreateArchiveBinderDto,
    companyId: string,
    userId: string,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Le nom du classeur est obligatoire.');
    }
    const personName = dto.personName?.trim() || null;
    if (dto.category === 'HR_CV' && !personName) {
      throw new BadRequestException(
        'Indiquez le nom de l’agent ou du stagiaire pour cette famille.',
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const binder = await transaction.archiveBinder.create({
          data: {
            companyId,
            name,
            category: dto.category,
            personName,
            fiscalYear: dto.fiscalYear,
            period: dto.period?.trim() || '',
          },
          select: {
            id: true,
            name: true,
            category: true,
            personName: true,
            fiscalYear: true,
            period: true,
            createdAt: true,
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'ARCHIVE_BINDER_CREATED',
            details: {
              binderId: binder.id,
              name: binder.name,
              category: binder.category,
              personName: binder.personName,
              fiscalYear: binder.fiscalYear,
              period: binder.period,
            },
          },
        });
        return { ...binder, documentCount: 0 };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Un classeur portant ce nom existe déjà pour cette famille, cet exercice et cette période.',
        );
      }
      throw error;
    }
  }

  async deleteBinder(id: string, companyId: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const binder = await transaction.archiveBinder.findFirst({
          where: { id, companyId },
          select: { id: true, name: true },
        });
        if (!binder) {
          throw new NotFoundException(
            'Classeur introuvable dans les archives de ce cabinet.',
          );
        }

        const documentCount = await transaction.archiveDocument.count({
          where: { companyId, binderId: id },
        });
        if (documentCount > 0) {
          throw new ConflictException(
            'Ce classeur contient des documents, y compris dans la corbeille. Déplacez-les ou supprimez-les définitivement avant de supprimer le classeur.',
          );
        }

        await transaction.archiveBinder.delete({ where: { id } });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'ARCHIVE_BINDER_DELETED',
            details: { binderId: binder.id, name: binder.name },
          },
        });
        return { id: binder.id, deleted: true };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Ce classeur contient des documents. Déplacez-les ou supprimez-les définitivement avant de supprimer le classeur.',
        );
      }
      throw error;
    }
  }

  async list(query: ArchiveListQueryDto, companyId: string) {
    return this.prisma.archiveDocument.findMany({
      where: metadataWhere(companyId, query, false),
      select: this.metadataSelect(),
      orderBy: [
        { isPinned: 'desc' },
        { fiscalYear: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 300,
    });
  }

  async listTrash(query: ArchiveListQueryDto, companyId: string) {
    return this.prisma.archiveDocument.findMany({
      where: metadataWhere(companyId, query, true),
      select: this.metadataSelect(),
      orderBy: { deletedAt: 'desc' },
      take: 300,
    });
  }

  async setPinned(
    dto: UpdateArchivePinsDto,
    companyId: string,
    userId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const documents = await transaction.archiveDocument.findMany({
        where: {
          companyId,
          deletedAt: null,
          id: { in: dto.documentIds },
        },
        select: { id: true, title: true },
      });
      if (documents.length !== dto.documentIds.length) {
        throw new NotFoundException(
          'Un ou plusieurs fichiers ne sont pas disponibles dans les archives de ce cabinet.',
        );
      }
      const updated = await transaction.archiveDocument.updateMany({
        where: {
          companyId,
          deletedAt: null,
          id: { in: dto.documentIds },
        },
        data: { isPinned: dto.isPinned },
      });
      if (updated.count !== documents.length) {
        throw new ConflictException(
          'Un fichier a été modifié pendant la sélection. Actualisez les archives et réessayez.',
        );
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: dto.isPinned
            ? 'ARCHIVE_DOCUMENTS_PINNED'
            : 'ARCHIVE_DOCUMENTS_UNPINNED',
          details: {
            documentIds: documents.map((document) => document.id),
            titles: documents.map((document) => document.title),
          },
        },
      });
      return transaction.archiveDocument.findMany({
        where: {
          companyId,
          deletedAt: null,
          id: { in: dto.documentIds },
        },
        select: this.metadataSelect(),
      });
    });
  }

  async create(
    dto: CreateArchiveDocumentDto,
    companyId: string,
    userId: string,
  ) {
    if (!dto.title.trim() || !dto.originalName.trim()) {
      throw new BadRequestException(
        'Le titre et le nom du fichier sont obligatoires.',
      );
    }
    const submittedPersonName = dto.personName?.trim() || null;
    if (dto.category === 'HR_CV' && !submittedPersonName && !dto.binderId) {
      throw new BadRequestException(
        'Indiquez le nom de l’agent ou du stagiaire pour ce document.',
      );
    }
    let personName = submittedPersonName;
    const extension = dto.originalName
      .trim()
      .toLowerCase()
      .match(/\.[a-z0-9]+$/)?.[0];
    if (!extension || !allowedExtensions[dto.mimeType].includes(extension)) {
      throw new BadRequestException(
        'Le type de fichier ne correspond pas à son extension.',
      );
    }

    const data = Buffer.from(dto.data, 'base64');
    if (
      data.length === 0 ||
      data.length > MAX_FILE_SIZE ||
      data.toString('base64').replace(/=+$/, '') !== dto.data.replace(/=+$/, '')
    ) {
      throw new BadRequestException(
        'Le fichier est vide, invalide ou dépasse la limite de 10 Mo.',
      );
    }
    this.validateSignature(data, dto.mimeType);

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) {
        throw new NotFoundException(
          'Le dossier client est introuvable dans ce cabinet.',
        );
      }
    }

    if (dto.binderId) {
      const binder = await this.prisma.archiveBinder.findFirst({
        where: {
          id: dto.binderId,
          companyId,
          category: dto.category,
          fiscalYear: dto.fiscalYear,
        },
        select: { id: true, personName: true },
      });
      if (!binder) {
        throw new NotFoundException(
          'Le classeur est introuvable dans cette famille et cet exercice.',
        );
      }
      if (
        dto.category === 'HR_CV' &&
        submittedPersonName &&
        binder.personName?.toLocaleLowerCase('fr') !==
          submittedPersonName.toLocaleLowerCase('fr')
      ) {
        throw new BadRequestException(
          'Le nom doit correspondre à celui de l’agent ou du stagiaire du classeur.',
        );
      }
      if (dto.category === 'HR_CV') {
        personName = binder.personName || submittedPersonName;
      }
    }

    const document = await this.prisma
      .$transaction(async (transaction) => {
        const created = await transaction.archiveDocument.create({
          data: {
            companyId,
            customerId: dto.customerId,
            personName,
            ...(dto.binderId ? { binderId: dto.binderId } : {}),
            category: dto.category,
            binder: dto.binder?.trim() || null,
            fiscalYear: dto.fiscalYear,
            period: dto.period?.trim() || null,
            title: dto.title.trim(),
            originalName: dto.originalName.trim(),
            mimeType: dto.mimeType,
            size: data.length,
            documentDate: dto.documentDate ? new Date(dto.documentDate) : null,
            description: dto.description?.trim() || null,
            data,
          },
          select: { id: true, title: true, originalName: true, size: true },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'ARCHIVE_DOCUMENT_CREATED',
            details: {
              documentId: created.id,
              title: created.title,
              originalName: created.originalName,
              size: created.size,
              category: dto.category,
              fiscalYear: dto.fiscalYear,
              ...(dto.binderId ? { binderId: dto.binderId } : {}),
            },
          },
        });
        return created;
      })
      .catch((error: unknown) => {
        if (
          dto.binderId &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2003'
        ) {
          throw new ConflictException(
            'Le classeur a été supprimé ou modifié. Actualisez la page avant de déposer ce document.',
          );
        }
        throw error;
      });
    return document;
  }

  async getContent(id: string, companyId: string) {
    const document = await this.prisma.archiveDocument.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { originalName: true, mimeType: true, data: true },
    });
    if (!document) throw new NotFoundException('Document archivé introuvable.');
    return {
      ...document,
      data: Buffer.from(document.data),
    };
  }

  async softDelete(id: string, companyId: string, userId: string) {
    return this.changeDeletedState(id, companyId, userId, 'delete');
  }

  async restore(id: string, companyId: string, userId: string) {
    return this.changeDeletedState(id, companyId, userId, 'restore');
  }

  async permanentlyDelete(id: string, companyId: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const document = await transaction.archiveDocument.findFirst({
        where: { id, companyId, deletedAt: { not: null } },
        select: { id: true, title: true, originalName: true },
      });
      if (!document) {
        throw new NotFoundException(
          'Document introuvable dans la corbeille du cabinet.',
        );
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'ARCHIVE_DOCUMENT_PERMANENTLY_DELETED',
          details: {
            documentId: document.id,
            title: document.title,
            originalName: document.originalName,
          },
        },
      });
      await transaction.archiveDocument.delete({ where: { id: document.id } });
      return { id: document.id, deleted: true };
    });
  }

  private async changeDeletedState(
    id: string,
    companyId: string,
    userId: string,
    operation: 'delete' | 'restore',
  ) {
    const expectedDeletedAt = operation === 'delete' ? null : { not: null };
    const changed = await this.prisma.$transaction(async (transaction) => {
      const document = await transaction.archiveDocument.findFirst({
        where: {
          id,
          companyId,
          deletedAt: expectedDeletedAt,
        },
        select: { id: true, title: true },
      });
      if (!document) {
        throw new NotFoundException(
          operation === 'delete'
            ? 'Document archivé introuvable.'
            : 'Document introuvable dans la corbeille.',
        );
      }

      const result = await transaction.archiveDocument.updateMany({
        where: {
          id,
          companyId,
          deletedAt: expectedDeletedAt,
        },
        data: { deletedAt: operation === 'delete' ? new Date() : null },
      });
      if (!result.count) {
        throw new ConflictException(
          'Le document a été modifié simultanément. Actualisez la page.',
        );
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action:
            operation === 'delete'
              ? 'ARCHIVE_DOCUMENT_TRASHED'
              : 'ARCHIVE_DOCUMENT_RESTORED',
          details: { documentId: document.id, title: document.title },
        },
      });
      return { id: document.id, deleted: operation === 'delete' };
    });
    return changed;
  }

  private validateSignature(data: Buffer, mimeType: string) {
    const isPdf =
      mimeType === 'application/pdf' &&
      data.subarray(0, 5).toString() === '%PDF-';
    const isPng =
      mimeType === 'image/png' &&
      data
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg =
      mimeType === 'image/jpeg' &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff;
    const isOffice =
      (mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType ===
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') &&
      data.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    if (!isPdf && !isPng && !isJpeg && !isOffice) {
      throw new BadRequestException(
        'Le contenu du fichier ne correspond pas au format annoncé.',
      );
    }
  }

  private metadataSelect() {
    return {
      id: true,
      customerId: true,
      binderId: true,
      personName: true,
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
      isPinned: true,
      createdAt: true,
      customer: { select: { id: true, name: true } },
      archiveBinder: {
        select: {
          id: true,
          name: true,
          category: true,
          personName: true,
          fiscalYear: true,
          period: true,
        },
      },
    };
  }
}
