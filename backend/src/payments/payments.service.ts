import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import { CreatePaymentDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.payment.findMany({
      where: { companyId: getCompanyId() },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, currency: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async create(dto: CreatePaymentDto) {
    const companyId = getCompanyId();
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Le montant du paiement doit être positif.');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const invoice = await transaction.invoice.findFirst({
          where: { id: dto.invoiceId, companyId },
          select: {
            id: true,
            customerId: true,
            currency: true,
            totalAmount: true,
            paidAmount: true,
          },
        });
        if (!invoice) throw new NotFoundException('Facture introuvable.');
        if (
          (dto.method === 'CASH_CDF' && invoice.currency !== 'CDF') ||
          (dto.method === 'CASH_USD' && invoice.currency !== 'USD')
        ) {
          throw new BadRequestException(
            'La devise du paiement en espèces doit correspondre à celle de la facture.',
          );
        }
        if (amount.add(invoice.paidAmount).gt(invoice.totalAmount)) {
          throw new BadRequestException(
            'Le règlement dépasse le solde restant de cette facture.',
          );
        }

        const payment = await transaction.payment.create({
          data: {
            companyId,
            invoiceId: invoice.id,
            customerId: invoice.customerId,
            method: dto.method,
            amount,
            currency: invoice.currency,
            reference: dto.reference?.trim(),
            status: 'RECEIVED',
            allocations: {
              create: { invoiceId: invoice.id, amount },
            },
          },
          include: {
            invoice: { select: { id: true, invoiceNumber: true, currency: true } },
            customer: { select: { name: true } },
          },
        });

        await transaction.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount: { increment: amount } },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            action: 'INVOICE_PAYMENT_RECEIVED',
            details: {
              paymentId: payment.id,
              invoiceId: invoice.id,
              amount: amount.toString(),
              currency: invoice.currency,
            },
          },
        });

        return payment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Ce paiement a déjà été enregistré. Actualisez la page avant de réessayer.',
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new BadRequestException(
          'La facture a été réglée en même temps par une autre opération. Actualisez puis réessayez.',
        );
      }
      throw error;
    }
  }
}
