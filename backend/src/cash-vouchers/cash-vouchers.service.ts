import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, PaymentOrderStatus, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import {
  assertCashAvailable,
  assertPaymentOrderFundingAvailable,
  createCashMovement,
  endOfDay,
  ensureCashAccount,
  getPaymentOrderFundingBalance,
  getCashBalance,
  lockCashAccount,
} from './cash-ledger';
import {
  CancelCashVoucherDto,
  CreateCashVoucherDto,
  FundCashAccountDto,
  RejectCashVoucherDto,
  ReconcileCashAccountDto,
} from './cash-vouchers.dto';
import { NotificationsService } from '../notifications/notifications.service';

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

@Injectable()
export class CashVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
        accounts.map(async (account) => {
          const [balance, provisionedFunds] = await Promise.all([
            getCashBalance(transaction, companyId, account.id),
            getPaymentOrderFundingBalance(transaction, companyId, account.id),
          ]);
          const paymentOrderAvailable = provisionedFunds;
          return { account, balance, paymentOrderAvailable };
        }),
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
        accounts: balances.map(({ account, balance, paymentOrderAvailable }) => ({
          ...account,
          balance: balance.toString(),
          paymentOrderAvailable: paymentOrderAvailable.toString(),
        })),
        movements: movements.map((movement) => ({
          ...movement,
          amount: movement.amount.toString(),
        })),
      };
    });
  }

  async treasuryPeriod(companyId: string, from: string, to: string) {
    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new BadRequestException(
        'Choisissez une date de début et une date de fin valides.',
      );
    }
    if (from > to) {
      throw new BadRequestException(
        'La date de début doit précéder ou égaler la date de fin.',
      );
    }

    const rangeStart = new Date(`${from}T00:00:00.000Z`);
    const rangeEnd = new Date(`${to}T23:59:59.999Z`);
    const beforeStart = new Date(rangeStart.getTime() - 1);

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
        accounts.map(async (account) => {
          const [openingBalance, closingBalance, openingFunds, closingFunds] =
            await Promise.all([
              getCashBalance(transaction, companyId, account.id, beforeStart),
              getCashBalance(transaction, companyId, account.id, rangeEnd),
              getPaymentOrderFundingBalance(
                transaction,
                companyId,
                account.id,
                beforeStart,
              ),
              getPaymentOrderFundingBalance(
                transaction,
                companyId,
                account.id,
                rangeEnd,
              ),
            ]);
          return {
            account,
            openingBalance,
            closingBalance,
            openingFunds,
            closingFunds,
          };
        }),
      );
      const movements = await transaction.cashMovement.findMany({
        where: {
          companyId,
          date: { gte: rangeStart, lte: rangeEnd },
        },
        include: {
          cashAccount: { select: { code: true, name: true, currency: true } },
        },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        from,
        to,
        accounts: balances.map(
          ({ account, openingBalance, closingBalance, openingFunds, closingFunds }) => ({
            ...account,
            openingBalance: openingBalance.toString(),
            closingBalance: closingBalance.toString(),
            openingPaymentOrderAvailable: openingFunds.toString(),
            closingPaymentOrderAvailable: closingFunds.toString(),
          }),
        ),
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
    const source = 'Associé-Gérant';
    if (amount.lte(0) || dto.source !== 'ASSOCIE_GERANT')
      throw new BadRequestException(
        'L’approvisionnement réservé aux OP doit provenir de l’Associé-Gérant.',
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
      const provisionedFunds = await getPaymentOrderFundingBalance(
        transaction,
        companyId,
        account.id,
      );
      const paymentOrderAvailable = provisionedFunds;
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
        paymentOrderAvailable: paymentOrderAvailable.toString(),
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
          status: 'PENDING_APPROVAL',
        },
      });

      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_SUBMITTED_FOR_APPROVAL',
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

  async approve(
    id: string,
    companyId: string,
    userId: string,
    managerName: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const header = await transaction.cashVoucher.findFirst({
        where: { id, companyId },
        select: { id: true, cashAccountId: true, status: true },
      });
      if (!header) throw new NotFoundException('Bon de sortie introuvable.');
      if (!header.cashAccountId) {
        throw new ConflictException('Ce bon n’est lié à aucune caisse.');
      }
      await lockCashAccount(transaction, header.cashAccountId);
      const voucher = await transaction.cashVoucher.findFirst({
        where: { id, companyId },
      });
      if (!voucher) throw new NotFoundException('Bon de sortie introuvable.');
      if (voucher.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(
          'Seul un bon en attente peut être approuvé.',
        );
      }

      const linkedOrderHeader = await transaction.paymentOrder.findFirst({
        where: { companyId, cashVoucherId: voucher.id },
        select: { id: true, orderNumber: true, status: true },
      });
      if (
        linkedOrderHeader &&
        linkedOrderHeader.status !== PaymentOrderStatus.APPROVED
      ) {
        throw new ConflictException(
          'L’OP liée n’est plus en attente de règlement. Vérifiez le dossier avant de libérer ce bon.',
        );
      }

      const approvalDate = new Date();
      const cashAccount = await ensureCashAccount(
        transaction,
        companyId,
        voucher.currency as 'CDF' | 'USD',
      );
      if (cashAccount.id !== voucher.cashAccountId) {
        throw new ConflictException('La caisse liée au bon a été modifiée.');
      }
      await assertPaymentOrderFundingAvailable(
        transaction,
        companyId,
        cashAccount.id,
        voucher.amount,
        endOfDay(approvalDate),
      );
      await assertCashAvailable(
        transaction,
        companyId,
        cashAccount.id,
        voucher.amount,
        endOfDay(approvalDate),
      );

      const approved = await transaction.cashVoucher.updateMany({
        where: { id, companyId, status: 'PENDING_APPROVAL' },
        data: {
          status: 'ISSUED',
          date: approvalDate,
          managerApprovalName: managerName,
          managerApprovalBy: userId,
          managerApprovedAt: approvalDate,
        },
      });
      if (approved.count !== 1) {
        throw new ConflictException(
          'Ce bon a été traité entre-temps. Actualisez le registre.',
        );
      }

      await createCashMovement(transaction, {
        companyId,
        cashAccountId: cashAccount.id,
        date: approvalDate,
        direction: 'OUT',
        amount: voucher.amount,
        sourceType: 'CASH_VOUCHER',
        sourceId: voucher.id,
        description: `${voucher.category} · ${voucher.beneficiary} · ${voucher.reason}`,
        reference: voucher.voucherNumber,
      });
      const linkedOrder = await transaction.paymentOrder.updateMany({
        where: {
          companyId,
          cashVoucherId: voucher.id,
          status: PaymentOrderStatus.APPROVED,
        },
        data: {
          status: PaymentOrderStatus.PAID,
          paidAt: approvalDate,
          paidBy: userId,
        },
      });
      if (linkedOrderHeader && linkedOrder.count !== 1) {
        throw new ConflictException(
          'Le statut de l’OP liée n’a pas pu être clôturé. La sortie a été annulée; actualisez le dossier.',
        );
      }
      if (linkedOrderHeader) {
        await transaction.auditLog.create({
          data: {
            companyId,
            userId,
            action: 'PAYMENT_ORDER_PAID',
            details: {
              paymentOrderId: linkedOrderHeader.id,
              orderNumber: linkedOrderHeader.orderNumber,
              voucherId: voucher.id,
              voucherNumber: voucher.voucherNumber,
              amount: voucher.amount.toString(),
              currency: voucher.currency,
            },
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_APPROVED_AND_RELEASED',
          details: {
            voucherId: voucher.id,
            voucherNumber: voucher.voucherNumber,
            amount: voucher.amount.toString(),
            currency: voucher.currency,
          },
        },
      });
      await this.notifications.notifyRoles(
        transaction,
        companyId,
        [UserRole.CASHIER],
        `Bon de sortie approuvé · ${voucher.voucherNumber}`,
        `L’Associé-Gérant a libéré la sortie de ${voucher.amount.toString()} ${voucher.currency} au bénéfice de ${voucher.beneficiary}. Vous pouvez effectuer le paiement et imprimer le bon.`,
        userId,
      );
      return transaction.cashVoucher.findUniqueOrThrow({ where: { id } });
    });
  }

  async reject(
    id: string,
    dto: RejectCashVoucherDto,
    companyId: string,
    userId: string,
    managerName: string,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 4) {
      throw new BadRequestException('Indiquez le motif du rejet.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const rejected = await transaction.cashVoucher.updateMany({
        where: { id, companyId, status: 'PENDING_APPROVAL' },
        data: {
          status: 'REJECTED',
          rejectionReason: reason,
          managerApprovalName: managerName,
          managerApprovalBy: userId,
          managerRejectedAt: new Date(),
        },
      });
      if (!rejected.count) {
        const existing = await transaction.cashVoucher.findFirst({
          where: { id, companyId },
          select: { id: true },
        });
        if (!existing)
          throw new NotFoundException('Bon de sortie introuvable.');
        throw new ConflictException(
          'Seul un bon en attente peut être rejeté.',
        );
      }
      await transaction.auditLog.create({
        data: {
          companyId,
          userId,
          action: 'CASH_VOUCHER_REJECTED',
          details: { voucherId: id, reason },
        },
      });
      const rejectedVoucher = await transaction.cashVoucher.findUniqueOrThrow({
        where: { id },
        select: { voucherNumber: true },
      });
      await this.notifications.notifyRoles(
        transaction,
        companyId,
        [UserRole.CASHIER],
        `Bon de sortie rejeté · ${rejectedVoucher.voucherNumber}`,
        `L’Associé-Gérant a rejeté ce bon de sortie. Motif : ${reason}`,
        userId,
      );
      return transaction.cashVoucher.findUniqueOrThrow({ where: { id } });
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
      if (voucher.status !== 'ISSUED') {
        throw new ConflictException(
          'Seul un bon approuvé peut être annulé. Rejetez un bon en attente.',
        );
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
