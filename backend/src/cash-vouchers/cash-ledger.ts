import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type CashTransaction = Prisma.TransactionClient;

export async function ensureCashAccount(
  transaction: CashTransaction,
  companyId: string,
  currency: 'CDF' | 'USD',
) {
  const code = currency === 'CDF' ? '571-CDF' : '571-USD';
  const name =
    currency === 'CDF' ? 'Caisse principale CDF' : 'Caisse principale USD';
  return transaction.cashAccount.upsert({
    where: { companyId_currency: { companyId, currency } },
    create: { companyId, currency, code, name },
    update: {},
  });
}

export async function lockCashAccount(
  transaction: CashTransaction,
  cashAccountId: string,
) {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtext(${`cash-account:${cashAccountId}`}), 0)
  `;
}

export async function getCashBalance(
  transaction: CashTransaction,
  companyId: string,
  cashAccountId: string,
  throughDate?: Date,
) {
  const rows = await transaction.cashMovement.groupBy({
    by: ['direction'],
    where: {
      companyId,
      cashAccountId,
      ...(throughDate ? { date: { lte: throughDate } } : {}),
    },
    _sum: { amount: true },
  });
  return rows.reduce((balance, row) => {
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    return row.direction === 'IN' ? balance.add(amount) : balance.sub(amount);
  }, new Prisma.Decimal(0));
}

export async function assertCashAvailable(
  transaction: CashTransaction,
  companyId: string,
  cashAccountId: string,
  amount: Prisma.Decimal,
  throughDate: Date,
) {
  const balance = await getCashBalance(
    transaction,
    companyId,
    cashAccountId,
    throughDate,
  );
  if (balance.lt(amount)) {
    throw new BadRequestException(
      `Solde insuffisant dans cette caisse à la date choisie (${balance.toFixed(2)} disponibles). Enregistrez d’abord le solde physique ou un encaissement.`,
    );
  }
  return balance;
}

export async function createCashMovement(
  transaction: CashTransaction,
  input: {
    companyId: string;
    cashAccountId: string;
    date: Date;
    direction: 'IN' | 'OUT';
    amount: Prisma.Decimal;
    sourceType: string;
    sourceId: string;
    description: string;
    reference?: string | null;
  },
) {
  return transaction.cashMovement.create({
    data: {
      ...input,
      reference: input.reference || null,
    },
  });
}

export function endOfDay(date: Date) {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
