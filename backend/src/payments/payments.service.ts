import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import {
  createCashMovement,
  ensurePaymentMethodAccount,
  lockCashAccount,
} from '../cash-vouchers/cash-ledger';
import { CreatePaymentDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.payment.findMany({
      where: { companyId: getCompanyId() },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            currency: true,
            totalAmount: true,
          },
        },
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
      throw new BadRequestException(
        'Le montant du paiement doit être positif.',
      );
    }

    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const invoice = await transaction.invoice.findFirst({
            where: { id: dto.invoiceId, companyId },
            select: {
              id: true,
              customerId: true,
              currency: true,
              fiscalStatus: true,
              totalAmount: true,
              paidAmount: true,
            },
          });
          if (!invoice) throw new NotFoundException('Facture introuvable.');
          if (
            invoice.fiscalStatus === 'DRAFT' ||
            invoice.fiscalStatus === 'REJECTED' ||
            invoice.fiscalStatus === 'CANCELLED'
          ) {
            throw new BadRequestException(
              'Un règlement ne peut être enregistré que sur une facture en attente de traitement ou certifiée.',
            );
          }
          if (
            (dto.method === 'CASH_CDF' && invoice.currency !== 'CDF') ||
            (dto.method === 'CASH_USD' && invoice.currency !== 'USD')
          ) {
            throw new BadRequestException(
              'La devise du paiement en espèces doit correspondre à celle de la facture.',
            );
          }

          const treasuryAccount = await ensurePaymentMethodAccount(
            transaction,
            companyId,
            invoice.currency as 'CDF' | 'USD',
            dto.method,
          );
          await lockCashAccount(transaction, treasuryAccount.id);
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
              invoicePaidAmountAfter: invoice.paidAmount.add(amount),
              currency: invoice.currency,
              reference: dto.reference?.trim(),
              status: 'RECEIVED',
              allocations: {
                create: { invoiceId: invoice.id, amount },
              },
            },
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  currency: true,
                  totalAmount: true,
                },
              },
              customer: { select: { name: true } },
            },
          });

          await transaction.invoice.update({
            where: { id: invoice.id },
            data: { paidAmount: { increment: amount } },
          });
          await createCashMovement(transaction, {
            companyId,
            cashAccountId: treasuryAccount.id,
            date: payment.createdAt,
            direction: 'IN',
            amount,
            sourceAmount: amount,
            sourceCurrency: invoice.currency,
            sourceType: 'INVOICE_PAYMENT',
            sourceId: payment.id,
            description: `Règlement facture ${payment.invoice?.invoiceNumber ?? invoice.id} · ${dto.method}`,
            reference: payment.reference,
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
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
  async cancel(id: string, reason: string) {
    const companyId = getCompanyId();
    const cancellationReason = reason.trim();
    if (cancellationReason.length < 3) throw new BadRequestException('Indiquez un motif d’annulation (3 caractères minimum).');

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const payment = await transaction.payment.findFirst({
          where: { id, companyId },
          include: { invoice: { select: { id: true, invoiceNumber: true, currency: true, totalAmount: true, paidAmount: true } } },
        });
        if (!payment) throw new NotFoundException('Règlement introuvable.');
        if (payment.status !== 'RECEIVED') throw new BadRequestException('Ce règlement est déjà annulé ou n’est plus actif.');

        const originalMovement = await transaction.cashMovement.findFirst({
          where: { companyId, sourceType: 'INVOICE_PAYMENT', sourceId: payment.id },
          select: { cashAccountId: true, amount: true },
        });
        if (originalMovement) await lockCashAccount(transaction, originalMovement.cashAccountId);

        const updated = await transaction.payment.updateMany({
          where: { id: payment.id, companyId, status: 'RECEIVED' },
          data: { status: 'CANCELLED' },
        });
        if (updated.count !== 1) throw new BadRequestException('Ce règlement a déjà été annulé. Actualisez le registre.');

        if (payment.invoiceId) {
          const activePayments = await transaction.payment.findMany({
            where: { companyId, invoiceId: payment.invoiceId, status: 'RECEIVED' },
            select: { id: true, amount: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });
          let paidAmount = new Prisma.Decimal(0);
          for (const activePayment of activePayments) {
            paidAmount = paidAmount.add(activePayment.amount);
            await transaction.payment.update({ where: { id: activePayment.id }, data: { invoicePaidAmountAfter: paidAmount } });
          }
          await transaction.invoice.updateMany({ where: { id: payment.invoiceId, companyId }, data: { paidAmount } });
        }

        await transaction.cashMovement.deleteMany({
          where: {
            companyId,
            sourceId: payment.id,
            sourceType: { in: ['INVOICE_PAYMENT', 'INVOICE_PAYMENT_REVERSAL'] },
          },
        });

        await transaction.auditLog.create({
          data: { companyId, action: 'INVOICE_PAYMENT_CANCELLED', details: { paymentId: payment.id, invoiceId: payment.invoiceId, amount: payment.amount.toString(), currency: payment.currency, reason: cancellationReason } },
        });

        return transaction.payment.findFirstOrThrow({
          where: { id: payment.id, companyId },
          include: {
            invoice: { select: { id: true, invoiceNumber: true, currency: true, totalAmount: true, paidAmount: true } },
            customer: { select: { name: true } },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new BadRequestException('Le règlement a changé pendant l’opération. Actualisez puis réessayez.');
      }
      throw error;
    }
  }

}
