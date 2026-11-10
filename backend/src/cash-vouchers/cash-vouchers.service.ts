import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  assertCashAvailable,
  createCashMovement,
  endOfDay,
  ensureCashAccount,
  getCashBalance,
  lockCashAccount,
} from './cash-ledger';
import {
  CancelCashVoucherDto,
  CreateCashVoucherDto,
  FundCashAccountDto,
  ReconcileCashAccountDto,
} from './cash-vouchers.dto';

@Injectable()
export class CashVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.cashVoucher.findMany({
      where: { companyId },
      include: {
        cashAccount: { select: { code: true, name: true, currency: true } },
        expense: { select: { id: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });
  }

  async treasury(companyId: string) {
    return this.prisma.$transaction(async (transaction) => {
      await Promise.all([
        ensureCashAccount(transaction, companyId, 'CDF'),
        ensureCashAccount(transaction, companyId, 'USD'),
      ]);
      const accounts = await transaction.cashAccount.findMany({
        where: { companyId },
        orderBy: { currency: 'asc' },
      });
      const balances = await Promise.all(
        accounts.map(async (account) => ({
          account,
          balance: await getCashBalance(transaction, companyId, account.id),
        })),
      );
      const movements = await transaction.cashMovement.findMany({
        where: { companyId },
        include: {
          cashAccount: { select: { code: true, name: true, currency: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 150,
      });
      return {
        accounts: balances.map(({ account, balance }) => ({
          ...account,
          balance: balance.toString(),
        })),
        movements: movements.map((movement) => ({
          ...movement,
          amount: movement.amount.toString(),
        })),
      };
    });
  }

  async reconcile(
    id: string,
    dto: ReconcileCashAccountDto,
    companyId: string,
    userId: string,
  ) {
    const countedBalance = new Prisma.Decimal(dto.countedBalance);
    const reason = dto.reason.trim();
    if (countedBalance.lt(0)) {
      throw new BadRequestException(
        'Le solde physique ne peut pas être négatif.',
      );
    }
    if (reason.length < 4) {
      throw new BadRequestException('Précisez le motif du rapprochement.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const account = await transaction.cashAccount.findFirst({
        where: { id, companyId, isActive: true },
      });
      if (!account)
        throw new NotFoundException('Compte de caisse introuvable.');
      await lockCashAccount(transaction, account.id);
      const currentBalance = await getCashBalance(
        transaction,
        companyId,
        account.id,
      );
      const difference = countedBalance.sub(currentBalance);

      if (!difference.isZero()) {
        await createCashMovement(transaction, {
          companyId,
          cashAccountId: account.id,
          date: new Date(),
          direction: difference.gt(0) ? 'IN' : 'OUT',
          amount: difference.abs(),
          sourceType: 'CASH_COUNT_ADJUSTMENT',
          sourceId: randomUUID(),
          description: `Rapprochement physique : ${reason}`,
        });
      }

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_ACCOUNT_RECONCILED',
          details: {
            cashAccountId: account.id,
            currency: account.currency,
            balanceBefore: currentBalance.toString(),
            countedBalance: countedBalance.toString(),
            difference: difference.toString(),
            reason,
          },
        },
      });

      return {
        accountId: account.id,
        balance: countedBalance.toString(),
        difference: difference.toString(),
      };
    });
  }

  async fund(
    dto: FundCashAccountDto,
    companyId: string,
    userId: string,
  ) {
    const amount = new Prisma.Decimal(dto.amount);
    const source = dto.source.trim();
    if (amount.lte(0) || !source)
      throw new BadRequestException(
        'Indiquez un montant positif et l’origine des fonds.',
      );
    if (dto.currency === 'CDF' && !amount.isInteger())
      throw new BadRequestException(
        'Un approvisionnement en CDF doit être un nombre entier.',
      );
    const date = new Date(`${dto.date.slice(0, 10)}T12:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.date.slice(0, 10) ||
      date.getTime() > endOfDay(new Date()).getTime()
    )
      throw new BadRequestException(
        'La date d’approvisionnement doit être valide et ne peut pas être future.',
      );

    return this.prisma.$transaction(async (transaction) => {
      const account = await ensureCashAccount(
        transaction,
        companyId,
        dto.currency,
      );
      await lockCashAccount(transaction, account.id);
      const movement = await createCashMovement(transaction, {
        companyId,
        cashAccountId: account.id,
        date,
        direction: 'IN',
        amount,
        sourceType: 'CASH_FUNDING',
        sourceId: randomUUID(),
        description: `Approvisionnement caisse · ${source}`,
        reference: dto.reference?.trim() || null,
      });
      const balance = await getCashBalance(
        transaction,
        companyId,
        account.id,
      );
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_ACCOUNT_FUNDED',
          details: {
            cashAccountId: account.id,
            currency: dto.currency,
            amount: amount.toString(),
            balanceAfter: balance.toString(),
            source,
            reference: dto.reference?.trim() || null,
          },
        },
      });
      return {
        movement: { ...movement, amount: movement.amount.toString() },
        balance: balance.toString(),
      };
    });
  }

  async create(dto: CreateCashVoucherDto, companyId: string, userId: string) {
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException(
        'Le montant du bon doit être supérieur à zéro.',
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
        'La devise de la caisse doit correspondre à celle du bon.',
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.date)) {
      throw new BadRequestException('La date du bon est invalide.');
    }
    const date = new Date(`${dto.date}T12:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.date
    ) {
      throw new BadRequestException('La date du bon est invalide.');
    }
    if (date.getTime() > endOfDay(new Date()).getTime()) {
      throw new BadRequestException(
        'La date d’un décaissement ne peut pas être future.',
      );
    }
    const year = Number(dto.date.slice(0, 4));

    return this.prisma.$transaction(async (transaction) => {
      const cashAccount = await ensureCashAccount(
        transaction,
        companyId,
        dto.currency,
      );
      await lockCashAccount(transaction, cashAccount.id);
      await assertCashAvailable(
        transaction,
        companyId,
        cashAccount.id,
        amount,
        endOfDay(date),
      );
      await transaction.$queryRaw`
        WITH advisory_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${`cash-voucher:${companyId}`}), CAST(${year} AS INTEGER))
        )
        SELECT 1 FROM advisory_lock
      `;

      const vouchers = await transaction.cashVoucher.findMany({
        where: { companyId, voucherNumber: { startsWith: `BSC/${year}/` } },
        select: { voucherNumber: true },
      });
      const lastSequence = vouchers.reduce((maximum, voucher) => {
        const match = new RegExp(`^BSC/${year}/(\\d+)$`).exec(
          voucher.voucherNumber,
        );
        return Math.max(maximum, match ? Number(match[1]) : 0);
      }, 0);
      const voucherNumber = `BSC/${year}/${String(lastSequence + 1).padStart(4, '0')}`;

      const voucher = await transaction.cashVoucher.create({
        data: {
          companyId,
          voucherNumber,
          date,
          beneficiary: dto.beneficiary.trim(),
          category: dto.category.trim(),
          reason: dto.reason.trim(),
          amount,
          currency: dto.currency,
          method: dto.method,
          cashAccountId: cashAccount.id,
          accountCode: cashAccount.code,
          reference: dto.reference?.trim() || null,
        },
      });

      await createCashMovement(transaction, {
        companyId,
        cashAccountId: cashAccount.id,
        date,
        direction: 'OUT',
        amount,
        sourceType: 'CASH_VOUCHER',
        sourceId: voucher.id,
        description: `${voucher.category} · ${voucher.beneficiary} · ${voucher.reason}`,
        reference: voucher.voucherNumber,
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_ISSUED',
          details: {
            voucherId: voucher.id,
            voucherNumber,
            beneficiary: voucher.beneficiary,
            amount: amount.toString(),
            currency: voucher.currency,
          },
        },
      });

      return voucher;
    });
  }

  async cancel(
    id: string,
    dto: CancelCashVoucherDto,
    companyId: string,
    userId: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 4) {
      throw new BadRequestException(
        'Précisez le motif d’annulation (au moins 4 caractères).',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const voucherHeader = await transaction.cashVoucher.findFirst({
        where: { id, companyId },
        select: { id: true, cashAccountId: true },
      });
      if (!voucherHeader)
        throw new NotFoundException('Bon de sortie introuvable.');
      if (!voucherHeader.cashAccountId) {
        throw new ConflictException(
          'Ce bon historique n’est lié à aucune caisse.',
        );
      }
      await lockCashAccount(transaction, voucherHeader.cashAccountId);
      const voucher = await transaction.cashVoucher.findFirst({
        where: { id, companyId },
        include: { expense: true },
      });
      if (!voucher) throw new NotFoundException('Bon de sortie introuvable.');
      if (
        !voucher.cashAccountId ||
        voucher.cashAccountId !== voucherHeader.cashAccountId
      ) {
        throw new ConflictException(
          'La caisse liée au bon a été modifiée. Réessayez.',
        );
      }
      if (voucher.status === 'CANCELLED') {
        throw new ConflictException('Ce bon a déjà été annulé.');
      }

      const cancellation = await transaction.cashVoucher.updateMany({
        where: { id, companyId, status: 'ISSUED' },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
      });
      if (cancellation.count !== 1) {
        throw new ConflictException('Ce bon a déjà été annulé.');
      }
      await createCashMovement(transaction, {
        companyId,
        cashAccountId: voucher.cashAccountId,
        date: new Date(),
        direction: 'IN',
        amount: voucher.amount,
        sourceType: 'CASH_VOUCHER_REVERSAL',
        sourceId: voucher.id,
        description: `Annulation et réintégration du bon ${voucher.voucherNumber} : ${reason}`,
        reference: voucher.voucherNumber,
      });
      if (voucher.expense) {
        await transaction.expense.update({
          where: { id: voucher.expense.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'CABINET_EXPENSE_CANCELLED_BY_CASH_VOUCHER',
            details: {
              expenseId: voucher.expense.id,
              voucherId: voucher.id,
              voucherNumber: voucher.voucherNumber,
              reason,
            },
          },
        });
      }
      const reopenedOrder = await transaction.paymentOrder.updateMany({
        where: { companyId, cashVoucherId: voucher.id, status: 'PAID' },
        data: {
          status: 'APPROVED',
          paidAt: null,
          paidBy: null,
          cashVoucherId: null,
        },
      });
      if (reopenedOrder.count === 1) {
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'PAYMENT_ORDER_REOPENED_AFTER_VOUCHER_CANCELLATION',
            details: {
              voucherId: voucher.id,
              voucherNumber: voucher.voucherNumber,
              reason,
            },
          },
        });
      }
      const cancelled = await transaction.cashVoucher.findUniqueOrThrow({
        where: { id },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_CANCELLED',
          details: {
            voucherId: voucher.id,
            voucherNumber: voucher.voucherNumber,
            reason,
          },
        },
      });

      return cancelled;
    });
  }
}
