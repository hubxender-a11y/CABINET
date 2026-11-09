CREATE TYPE "CashMovementDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "CashAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "cashAccountId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" "CashMovementDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CashVoucher" ADD COLUMN "cashAccountId" UUID;

CREATE UNIQUE INDEX "CashAccount_companyId_currency_key"
ON "CashAccount"("companyId", "currency");
CREATE UNIQUE INDEX "CashAccount_companyId_code_key"
ON "CashAccount"("companyId", "code");
CREATE INDEX "CashAccount_companyId_isActive_idx"
ON "CashAccount"("companyId", "isActive");
CREATE UNIQUE INDEX "CashMovement_companyId_sourceType_sourceId_key"
ON "CashMovement"("companyId", "sourceType", "sourceId");
CREATE INDEX "CashMovement_companyId_date_createdAt_idx"
ON "CashMovement"("companyId", "date", "createdAt");
CREATE INDEX "CashMovement_cashAccountId_date_createdAt_idx"
ON "CashMovement"("cashAccountId", "date", "createdAt");
CREATE INDEX "CashVoucher_cashAccountId_date_idx"
ON "CashVoucher"("cashAccountId", "date");

ALTER TABLE "CashAccount"
ADD CONSTRAINT "CashAccount_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
ADD CONSTRAINT "CashMovement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement"
ADD CONSTRAINT "CashMovement_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashVoucher"
ADD CONSTRAINT "CashVoucher_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "CashAccount" ("id", "companyId", "currency", "code", "name", "updatedAt")
SELECT gen_random_uuid(), company."id", currency.code,
       CASE WHEN currency.code = 'CDF' THEN '571-CDF' ELSE '571-USD' END,
       CASE WHEN currency.code = 'CDF' THEN 'Caisse principale CDF' ELSE 'Caisse principale USD' END,
       CURRENT_TIMESTAMP
FROM "Company" company
CROSS JOIN (VALUES ('CDF'), ('USD')) AS currency(code);

UPDATE "CashVoucher" voucher
SET "cashAccountId" = account."id",
    "accountCode" = account."code"
FROM "CashAccount" account
WHERE account."companyId" = voucher."companyId"
  AND account."currency" = voucher."currency"
  AND voucher."method" IN ('CASH_CDF', 'CASH_USD');

INSERT INTO "CashMovement" (
  "id", "companyId", "cashAccountId", "date", "direction", "amount",
  "sourceType", "sourceId", "description", "reference"
)
SELECT gen_random_uuid(), voucher."companyId", voucher."cashAccountId", voucher."date",
       'OUT', voucher."amount", 'CASH_VOUCHER', voucher."id"::text,
       voucher."category" || ' · ' || voucher."beneficiary" || ' · ' || voucher."reason",
       voucher."voucherNumber"
FROM "CashVoucher" voucher
WHERE voucher."status" = 'ISSUED' AND voucher."cashAccountId" IS NOT NULL;

INSERT INTO "CashMovement" (
  "id", "companyId", "cashAccountId", "date", "direction", "amount",
  "sourceType", "sourceId", "description", "reference"
)
SELECT gen_random_uuid(), payment."companyId", account."id", payment."createdAt",
       'IN', payment."amount", 'INVOICE_PAYMENT', payment."id"::text,
       'Règlement reçu' || COALESCE(' · ' || payment."reference", ''), payment."reference"
FROM "Payment" payment
JOIN "CashAccount" account ON account."companyId" = payment."companyId"
  AND account."currency" = payment."currency"
WHERE payment."status" = 'RECEIVED' AND payment."method" IN ('CASH_CDF', 'CASH_USD');

INSERT INTO "CashMovement" (
  "id", "companyId", "cashAccountId", "date", "direction", "amount",
  "sourceType", "sourceId", "description"
)
SELECT gen_random_uuid(), expense."companyId", account."id", expense."date",
       'OUT', expense."amount", 'EXPENSE', expense."id"::text,
       expense."category" || COALESCE(' · ' || expense."description", '')
FROM "Expense" expense
JOIN "CashAccount" account ON account."companyId" = expense."companyId"
  AND account."currency" = expense."currency"
WHERE expense."method" IN ('CASH_CDF', 'CASH_USD');
