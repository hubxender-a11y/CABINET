import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FiscalStatus, InvoiceType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreateInvoiceDto } from './invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.invoice.findMany({
      where: { companyId: getCompanyId() },
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { issueDate: 'desc' },
      take: 200,
    });
  }

  async getOne(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId: getCompanyId() },
      include: {
        customer: true,
        items: true,
        taxes: true,
        payments: true,
        creditNotes: true,
      },
    });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    return invoice;
  }

  async create(dto: CreateInvoiceDto) {
    const companyId = getCompanyId();
    if (dto.dueDate && dto.dueDate < dto.issueDate) {
      throw new BadRequestException(
        'La date d’échéance ne peut pas précéder la date de facture.',
      );
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Dossier client introuvable.');

    const lineItems = dto.items.map((item) => {
      const quantity = new Prisma.Decimal(item.quantity);
      const unitPrice = new Prisma.Decimal(item.unitPrice);
      return {
        rubric: item.rubric.trim(),
        quantity,
        unitPrice,
        total: quantity.mul(unitPrice).toDecimalPlaces(2),
      };
    });
    const subtotal = lineItems.reduce(
      (sum, item) => sum.add(item.total),
      new Prisma.Decimal(0),
    );

    if (subtotal.lte(0)) {
      throw new BadRequestException(
        'Le total de la facture doit être supérieur à zéro.',
      );
    }

    const issueYear = Number(dto.issueDate.slice(0, 4));

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), CAST(${issueYear} AS INTEGER))`;

      const company = await transaction.company.findUnique({
        where: { id: companyId },
        select: { exchangeRateCdfPerUsd: true },
      });
      const existingNumbers = await transaction.invoice.findMany({
        where: {
          companyId,
          invoiceNumber: { endsWith: `/${issueYear}` },
        },
        select: { invoiceNumber: true },
      });
      const lastSequence = existingNumbers.reduce((maximum, invoice) => {
        const match = /^(\d+)\/\d{4}$/.exec(invoice.invoiceNumber);
        return match ? Math.max(maximum, Number(match[1])) : maximum;
      }, 0);
      const invoiceNumber = `${String(lastSequence + 1).padStart(3, '0')}/${issueYear}`;

      const invoice = await transaction.invoice.create({
        data: {
          companyId,
          customerId: customer.id,
          invoiceNumber,
          invoiceType: InvoiceType.SERVICE,
          fiscalStatus:
            dto.fiscalStatus === 'PENDING_FISCALIZATION'
              ? FiscalStatus.PENDING_FISCALIZATION
              : FiscalStatus.DRAFT,
          period: dto.period.trim(),
          concern: dto.concern.trim(),
          madeAt: dto.madeAt.trim(),
          issueDate: new Date(`${dto.issueDate}T12:00:00.000Z`),
          dueDate: dto.dueDate
            ? new Date(`${dto.dueDate}T12:00:00.000Z`)
            : null,
          exchangeRate: company?.exchangeRateCdfPerUsd ?? null,
          currency: dto.currency,
          subtotal,
          taxAmount: new Prisma.Decimal(0),
          totalAmount: subtotal,
          items: { create: lineItems },
        },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'INVOICE_DRAFT_CREATED',
          details: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customerId: customer.id,
            total: subtotal.toString(),
            currency: dto.currency,
          },
        },
      });

      return invoice;
    });
  }
}
