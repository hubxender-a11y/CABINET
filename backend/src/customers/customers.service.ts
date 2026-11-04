import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreateCustomerDto, UpdateCustomerDto } from './customers.dto';
import {
  CreateCustomerDocumentDto,
  customerDocumentMimeTypes,
} from './customer-document.dto';

const maxCustomerDocumentBytes = 4 * 1024 * 1024;
const maxCustomerDocuments = 30;

function decodeCustomerDocument(dto: CreateCustomerDocumentDto): Buffer {
  const name = dto.name.trim();
  if (
    !name ||
    Array.from(name).some(
      (character) =>
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127 ||
        character === '/' ||
        character === '\\',
    ) ||
    !customerDocumentMimeTypes.some((mimeType) => mimeType === dto.mimeType)
  ) {
    throw new BadRequestException(
      'Le nom ou le type du document est invalide.',
    );
  }

  const data = Buffer.from(dto.data, 'base64');
  if (
    !data.length ||
    data.length > maxCustomerDocumentBytes ||
    data.toString('base64') !== dto.data
  ) {
    throw new BadRequestException(
      'Le document est vide, invalide ou dépasse la limite de 4 Mo.',
    );
  }

  const isPdf =
    dto.mimeType === 'application/pdf' &&
    data.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPng =
    dto.mimeType === 'image/png' &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg =
    dto.mimeType === 'image/jpeg' &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff;
  if (!isPdf && !isPng && !isJpeg) {
    throw new BadRequestException(
      'Le contenu du fichier ne correspond pas au format annoncé.',
    );
  }
  return data;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string) {
    const companyId = getCompanyId();
    return this.prisma.customer.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sector: { contains: search, mode: 'insensitive' } },
                { contact: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
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
  }

  async statement(id: string) {
    const companyId = getCompanyId();
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
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
        createdAt: true,
      },
    });
    if (!customer) throw new NotFoundException('Dossier client introuvable.');

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, customerId: id },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { issueDate: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: { companyId, customerId: id },
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true, currency: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { customer, invoices, payments };
  }

  async listDocuments(customerId: string) {
    const companyId = getCompanyId();
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Dossier client introuvable.');

    return this.prisma.customerDocument.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
  }

  async addDocument(customerId: string, dto: CreateCustomerDocumentDto) {
    const companyId = getCompanyId();
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true, deletedAt: true, name: true },
    });
    if (!customer || customer.deletedAt) {
      throw new NotFoundException(
        'Un document ne peut être ajouté qu’à un dossier client actif.',
      );
    }

    const existingCount = await this.prisma.customerDocument.count({
      where: { companyId, customerId },
    });
    if (existingCount >= maxCustomerDocuments) {
      throw new BadRequestException(
        `Un dossier client ne peut pas contenir plus de ${maxCustomerDocuments} documents.`,
      );
    }
    const data = decodeCustomerDocument(dto);
    const storedData = Uint8Array.from(data);
    const name = dto.name.trim();

    return this.prisma.$transaction(async (transaction) => {
      const document = await transaction.customerDocument.create({
        data: {
          companyId,
          customerId,
          name,
          mimeType: dto.mimeType,
          size: data.length,
          data: storedData,
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CUSTOMER_DOCUMENT_ADDED',
          details: { customerId, documentId: document.id, name },
        },
      });
      return document;
    });
  }

  async getDocument(customerId: string, documentId: string) {
    const document = await this.prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        customerId,
        companyId: getCompanyId(),
      },
      select: { name: true, mimeType: true, size: true, data: true },
    });
    if (!document) throw new NotFoundException('Document client introuvable.');
    return document;
  }

  async deleteDocument(customerId: string, documentId: string) {
    const companyId = getCompanyId();
    const document = await this.prisma.customerDocument.findFirst({
      where: { id: documentId, customerId, companyId },
      select: { id: true, name: true },
    });
    if (!document) throw new NotFoundException('Document client introuvable.');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.customerDocument.delete({ where: { id: documentId } });
      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CUSTOMER_DOCUMENT_DELETED',
          details: { customerId, documentId, name: document.name },
        },
      });
    });
    return { id: documentId };
  }

  async create(dto: CreateCustomerDto) {
    const companyId = getCompanyId();
    const name = dto.name.trim();
    if (name.length < 2) {
      throw new BadRequestException(
        'Le nom du dossier doit contenir au moins deux caractères.',
      );
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const customer = await transaction.customer.create({
          data: {
            companyId,
            name,
            type: dto.type ?? 'COMPANY',
            status: dto.status ?? 'À jour',
            sector: dto.sector?.trim(),
            contact: dto.contact?.trim(),
            phone: dto.phone?.trim(),
            email: dto.email?.trim().toLowerCase(),
            address: dto.address?.trim(),
            nif: dto.nif?.trim(),
            rccm: dto.rccm?.trim(),
          },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            action: 'CUSTOMER_DOSSIER_CREATED',
            details: { customerId: customer.id, name: customer.name },
          },
        });
        return customer;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Un dossier portant cette identité existe déjà.',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const companyId = getCompanyId();
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Aucune modification à enregistrer.');
    }
    if (dto.name !== undefined && dto.name.trim().length < 2) {
      throw new BadRequestException(
        'Le nom du dossier doit contenir au moins deux caractères.',
      );
    }
    const existing = await this.prisma.customer.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Dossier client introuvable.');

    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.update({
        where: { id },
        data: {
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sector !== undefined
            ? { sector: dto.sector?.trim() || null }
            : {}),
          ...(dto.contact !== undefined
            ? { contact: dto.contact?.trim() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.trim().toLowerCase() || null }
            : {}),
          ...(dto.address !== undefined
            ? { address: dto.address?.trim() || null }
            : {}),
          ...(dto.nif !== undefined ? { nif: dto.nif?.trim() || null } : {}),
          ...(dto.rccm !== undefined ? { rccm: dto.rccm?.trim() || null } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CUSTOMER_DOSSIER_UPDATED',
          details: { customerId: customer.id, changes: { ...dto } },
        },
      });
      return customer;
    });
  }

  async delete(id: string) {
    const companyId = getCompanyId();
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.customer.findFirst({
        where: { id, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Dossier client introuvable.');

      const deletedAt = new Date();
      await transaction.customer.update({
        where: { id },
        data: { deletedAt },
      });
      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CUSTOMER_DOSSIER_ARCHIVED',
          details: { customerId: id },
        },
      });
      return { id, deletedAt };
    });
  }
}
