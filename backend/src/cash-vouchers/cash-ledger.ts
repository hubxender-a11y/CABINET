import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type CashTransaction = Prisma.TransactionClient;
export type TreasuryAccountType =
  'CASH' | 'BANK_TRANSFER' | 'CARD' | 'MOBILE_MONEY' | 'OTHER';

const accountNames: Record<TreasuryAccountType, string> = {
  CASH: 'Caisse principale',
  BANK_TRANSFER: 'Banque · virements',
  CARD: 'Banque · cartes',
  MOBILE_MONEY: 'Mobile money',
  OTHER: 'Autres encaissements',
};

export async function ensureTreasuryAccount(
  transaction: CashTransaction,
  companyId: string,
  currency: 'CDF' | 'USD',
  accountType: TreasuryAccountType,
) {
  const code =
    accountType === 'CASH'
      ? currency === 'CDF'
        ? '571-CDF'
        : '571-USD'
      : `${accountType}-${currency}`;
  return transaction.cashAccount.upsert({
    where: {
      companyId_currency_accountType: { companyId, currency, accountType },
    },
    create: {
      companyId,
      currency,
      accountType,
      code,
      name: `${accountNames[accountType]} ${currency}`,
    },
    update: {},
  });
}

export async function ensureCashAccount(
  transaction: CashTransaction,
  companyId: string,
  currency: 'CDF' | 'USD',
) {
  return ensureTreasuryAccount(transaction, companyId, currency, 'CASH');
}

export async function ensurePaymentMethodAccount(
  transaction: CashTransaction,
  companyId: string,
  currency: 'CDF' | 'USD',
  method:
    | 'CASH_CDF'
    | 'CASH_USD'
    | 'BANK_TRANSFER'
    | 'CARD'
    | 'MOBILE_MONEY'
    | 'OTHER',
) {
  return ensureTreasuryAccount(
    transaction,
    companyId,
    currency,
    method === 'CASH_CDF' || method === 'CASH_USD' ? 'CASH' : method,
  );
}

export async function lockCashAccount(
  transaction: CashTransaction,
  cashAccountId: string,
) {
  await transaction.$queryRaw`
    WITH advisory_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${`cash-account:${cashAccountId}`}), 0)
    )
    SELECT 1 FROM advisory_lock
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

export async function getPaymentOrderFundingBalance(
  transaction: CashTransaction,
  companyId: string,
  cashAccountId: string,
  throughDate?: Date,
) {
  const sourceAccount = await transaction.cashAccount.findFirst({
    where: { id: cashAccountId, companyId },
    select: { currency: true },
  });
  if (!sourceAccount) return new Prisma.Decimal(0);
  const accounts = await transaction.cashAccount.findMany({
    where: { companyId, currency: sourceAccount.currency, isActive: true },
    select: { id: true },
  });
  const rows = await transaction.cashMovement.groupBy({
    by: ['direction'],
    where: {
      companyId,
      cashAccountId: { in: accounts.map((account) => account.id) },
      ...(throughDate ? { date: { lte: throughDate } } : {}),
    },
    _sum: { amount: true },
  });
  return rows.reduce((balance, row) => {
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    return row.direction === 'IN' ? balance.add(amount) : balance.sub(amount);
  }, new Prisma.Decimal(0));
}

export async function getCashInflowTotal(
  transaction: CashTransaction,
  companyId: string,
  cashAccountId: string,
  throughDate?: Date,
) {
  const sourceAccount = await transaction.cashAccount.findFirst({
    where: { id: cashAccountId, companyId },
    select: { currency: true },
  });
  if (!sourceAccount) return new Prisma.Decimal(0);
  const accounts = await transaction.cashAccount.findMany({
    where: { companyId, currency: sourceAccount.currency, isActive: true },
    select: { id: true },
  });
  const rows = await transaction.cashMovement.groupBy({
    by: ['direction'],
    where: {
      companyId,
      cashAccountId: { in: accounts.map((account) => account.id) },
      direction: 'IN',
      ...(throughDate ? { date: { lte: throughDate } } : {}),
    },
    _sum: { amount: true },
  });
  return rows[0]?._sum.amount ?? new Prisma.Decimal(0);
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
      `Solde insuffisant dans ce compte de trésorerie à la date choisie (${balance.toFixed(2)} disponibles). Enregistrez d’abord un encaissement ou vérifiez le solde du compte.`,
    );
  }
  return balance;
}

export async function assertPaymentOrderFundingAvailable(
  transaction: CashTransaction,
  companyId: string,
  cashAccountId: string,
  amount: Prisma.Decimal,
  throughDate: Date,
) {
  const balance = await getPaymentOrderFundingBalance(
    transaction,
    companyId,
    cashAccountId,
    throughDate,
  );
  if (balance.lt(amount)) {
    throw new BadRequestException(
      `Approvisionnement de l’Associé-Gérant insuffisant (${balance.toFixed(2)} disponibles). Enregistrez les fonds réellement remis avant de valider ce décaissement.`,
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
    sourceAmount?: Prisma.Decimal | null;
    sourceCurrency?: string | null;
    exchangeRate?: Prisma.Decimal | null;
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
