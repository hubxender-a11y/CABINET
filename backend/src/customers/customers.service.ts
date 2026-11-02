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
            type: 'COMPANY',
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
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sector !== undefined
            ? { sector: dto.sector?.trim() || null }
            : {}),
          ...(dto.contact !== undefined
            ? { contact: dto.contact?.trim() || null }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
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
