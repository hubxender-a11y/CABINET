import {
  BadRequestException,
  ConflictException,
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

  private invoiceSequence(invoiceNumber: string, issueYear: number): number {
    const match = /^(\d+)\/(\d{4})$/.exec(invoiceNumber);
    return match?.[2] === String(issueYear) ? Number(match[1]) : 0;
  }

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

  async delete(id: string) {
    const companyId = getCompanyId();

    return this.prisma.$transaction(async (transaction) => {
      const initialInvoice = await transaction.invoice.findFirst({
        where: { id, companyId },
        select: { issueDate: true },
      });
      if (!initialInvoice) throw new NotFoundException('Facture introuvable.');

      const issueYear = initialInvoice.issueDate.getUTCFullYear();
      await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), CAST(${issueYear} AS INTEGER))`;

      const invoice = await transaction.invoice.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          customerId: true,
          totalAmount: true,
          paidAmount: true,
          currency: true,
          fiscalStatus: true,
          isCertified: true,
        },
      });
      if (!invoice) throw new NotFoundException('Facture introuvable.');
      if (
        invoice.isCertified ||
        invoice.fiscalStatus === FiscalStatus.CERTIFIED
      ) {
        throw new ConflictException(
          'Une facture certifiée ne peut pas être supprimée. Utilisez un avoir ou la procédure fiscale prévue.',
        );
      }

      const payments = await transaction.payment.findMany({
        where: {
          companyId,
          OR: [{ invoiceId: id }, { allocations: { some: { invoiceId: id } } }],
        },
        select: {
          id: true,
          invoiceId: true,
          amount: true,
          allocations: { select: { invoiceId: true, amount: true } },
        },
      });
      const deletedPaymentIds = payments.map((payment) => payment.id);
      const removedAllocations = new Map<string, Prisma.Decimal>();
      for (const payment of payments) {
        if (payment.invoiceId && payment.invoiceId !== id) {
          removedAllocations.set(
            payment.invoiceId,
            (
              removedAllocations.get(payment.invoiceId) ?? new Prisma.Decimal(0)
            ).add(payment.amount),
          );
        }
        for (const allocation of payment.allocations) {
          if (
            allocation.invoiceId === id ||
            allocation.invoiceId === payment.invoiceId
          ) {
            continue;
          }
          const current =
            removedAllocations.get(allocation.invoiceId) ??
            new Prisma.Decimal(0);
          removedAllocations.set(
            allocation.invoiceId,
            current.add(allocation.amount),
          );
        }
      }

      if (removedAllocations.size) {
        const affectedInvoices = await transaction.invoice.findMany({
          where: {
            companyId,
            id: { in: [...removedAllocations.keys()] },
          },
          select: { id: true, paidAmount: true },
        });
        for (const affectedInvoice of affectedInvoices) {
          const remainingPaidAmount = affectedInvoice.paidAmount.sub(
            removedAllocations.get(affectedInvoice.id) ?? 0,
          );
          if (remainingPaidAmount.lt(0)) {
            throw new BadRequestException(
              'Suppression impossible : les allocations de paiement sont incohérentes avec les soldes des autres factures.',
            );
          }
          await transaction.invoice.update({
            where: { id: affectedInvoice.id },
            data: { paidAmount: remainingPaidAmount },
          });
        }
      }

      if (deletedPaymentIds.length) {
        await transaction.payment.deleteMany({
          where: { companyId, id: { in: deletedPaymentIds } },
        });
      }
      await transaction.paymentAllocation.deleteMany({
        where: { invoiceId: id },
      });
      const [creditNotes, taxes, items, fiscalTransactions, transmissionLogs] =
        await Promise.all([
          transaction.creditNote.deleteMany({ where: { invoiceId: id } }),
          transaction.invoiceTax.deleteMany({ where: { invoiceId: id } }),
          transaction.invoiceItem.deleteMany({ where: { invoiceId: id } }),
          transaction.fiscalTransaction.deleteMany({
            where: { invoiceId: id },
          }),
          transaction.fiscalTransmissionLog.deleteMany({
            where: { invoiceId: id },
          }),
        ]);
      const deleted = await transaction.invoice.deleteMany({
        where: { id, companyId },
      });
      if (!deleted.count) throw new NotFoundException('Facture introuvable.');

      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'INVOICE_PERMANENTLY_DELETED',
          details: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            customerId: invoice.customerId,
            total: invoice.totalAmount.toString(),
            paidAmount: invoice.paidAmount.toString(),
            currency: invoice.currency,
            fiscalStatus: invoice.fiscalStatus,
            isCertified: invoice.isCertified,
            deletedPaymentCount: deletedPaymentIds.length,
            deletedCreditNoteCount: creditNotes.count,
            deletedTaxCount: taxes.count,
            deletedItemCount: items.count,
            deletedFiscalTransactionCount:
              fiscalTransactions.count + transmissionLogs.count,
          },
        },
      });

      return { id: invoice.id, deletedPaymentIds };
    });
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
      const deletedInvoiceLogs = await transaction.auditLog.findMany({
        where: { companyId, action: 'INVOICE_PERMANENTLY_DELETED' },
        select: { details: true },
      });
      const deletedInvoiceNumbers = deletedInvoiceLogs.flatMap(
        ({ details }) => {
          if (
            !details ||
            typeof details !== 'object' ||
            Array.isArray(details) ||
            typeof details.invoiceNumber !== 'string'
          ) {
            return [];
          }
          return [details.invoiceNumber];
        },
      );
      const lastSequence = [
        ...existingNumbers.map(({ invoiceNumber }) =>
          this.invoiceSequence(invoiceNumber, issueYear),
        ),
        ...deletedInvoiceNumbers.map((invoiceNumber) =>
          this.invoiceSequence(invoiceNumber, issueYear),
        ),
      ].reduce((maximum, sequence) => Math.max(maximum, sequence), 0);
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
