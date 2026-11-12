import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { getCompanyId } from '../database/company-context';
import {
  assertCashAvailable,
  createCashMovement,
  endOfDay,
  ensurePaymentMethodAccount,
  lockCashAccount,
} from '../cash-vouchers/cash-ledger';
import { CreateExpenseDto } from './expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.expense.findMany({
      where: { companyId: getCompanyId() },
      include: { cashVoucher: { select: { voucherNumber: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async create(dto: CreateExpenseDto) {
    const companyId = getCompanyId();
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException(
        'Le montant de la charge doit être positif.',
      );
    }
    if (dto.currency === 'CDF' && !amount.isInteger()) {
      throw new BadRequestException(
        'Le montant en CDF doit être un nombre entier.',
      );
    }

    if (
      (dto.method === PaymentMethod.CASH_CDF && dto.currency !== 'CDF') ||
      (dto.method === PaymentMethod.CASH_USD && dto.currency !== 'USD')
    ) {
      throw new BadRequestException(
        'La devise du paiement en espèces doit correspondre à celle de la charge.',
      );
    }

    const date = new Date(dto.date);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.date.slice(0, 10)
    ) {
      throw new BadRequestException('La date de la charge est invalide.');
    }
    if (date.getTime() > endOfDay(new Date()).getTime()) {
      throw new BadRequestException(
        'La date d’une dépense ne peut pas être future.',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const isCash =
        dto.method === PaymentMethod.CASH_CDF ||
        dto.method === PaymentMethod.CASH_USD;
      const linkedVoucher = dto.cashVoucherId
        ? await transaction.cashVoucher.findFirst({
            where: { id: dto.cashVoucherId, companyId, status: 'ISSUED' },
          })
        : null;
      if (dto.cashVoucherId && !linkedVoucher) {
        throw new BadRequestException(
          'Le bon lié est introuvable ou déjà annulé.',
        );
      }
      if (linkedVoucher) {
        if (!isCash || !linkedVoucher.cashAccountId) {
          throw new BadRequestException(
            'Ce bon ne correspond pas à un paiement en espèces.',
          );
        }
        if (
          linkedVoucher.currency !== dto.currency ||
          linkedVoucher.method !== dto.method ||
          !linkedVoucher.amount.equals(amount) ||
          linkedVoucher.date.toISOString().slice(0, 10) !==
            date.toISOString().slice(0, 10)
        ) {
          throw new BadRequestException(
            'La devise, le montant, le moyen de paiement et la date doivent correspondre au bon lié.',
          );
        }
        const existingExpense = await transaction.expense.findFirst({
          where: { cashVoucherId: linkedVoucher.id },
          select: { id: true },
        });
        if (existingExpense) {
          throw new BadRequestException('Une charge est déjà liée à ce bon.');
        }
      }

      const cashAccount = linkedVoucher?.cashAccountId
        ? await transaction.cashAccount.findFirst({
            where: {
              id: linkedVoucher.cashAccountId,
              companyId,
              isActive: true,
            },
          })
        : await ensurePaymentMethodAccount(
            transaction,
            companyId,
            dto.currency,
            dto.method,
          );
      if (cashAccount) {
        await lockCashAccount(transaction, cashAccount.id);
        if (linkedVoucher) {
          const stillIssued = await transaction.cashVoucher.findFirst({
            where: {
              id: linkedVoucher.id,
              companyId,
              status: 'ISSUED',
            },
            select: { id: true },
          });
          if (!stillIssued) {
            throw new BadRequestException(
              'Le bon a été annulé pendant cette opération.',
            );
          }
          const alreadyLinked = await transaction.expense.findFirst({
            where: { cashVoucherId: linkedVoucher.id },
            select: { id: true },
          });
          if (alreadyLinked) {
            throw new BadRequestException('Une charge est déjà liée à ce bon.');
          }
        } else {
          await assertCashAvailable(
            transaction,
            companyId,
            cashAccount.id,
            amount,
            endOfDay(date),
          );
        }
      }
      const expense = await transaction.expense.create({
        data: {
          companyId,
          category: dto.category.trim(),
          date,
          amount,
          currency: dto.currency,
          method: dto.method,
          description: dto.description?.trim() || null,
          cashVoucherId: linkedVoucher?.id,
        },
        include: { cashVoucher: { select: { voucherNumber: true } } },
      });

      if (cashAccount && !linkedVoucher) {
        await createCashMovement(transaction, {
          companyId,
          cashAccountId: cashAccount.id,
          date,
          direction: 'OUT',
          amount,
          sourceType: 'EXPENSE',
          sourceId: expense.id,
          description: `${expense.category} · ${expense.description ?? 'Charge du cabinet'}`,
        });
      }

      await transaction.auditLog.create({
        data: {
          companyId,
          action: 'CABINET_EXPENSE_RECORDED',
          details: {
            expenseId: expense.id,
            category: expense.category,
            amount: amount.toString(),
            currency: expense.currency,
            cashVoucherId: expense.cashVoucherId,
          },
        },
      });

      return expense;
    });
  }
}
