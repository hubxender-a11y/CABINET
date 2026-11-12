ALTER TABLE "CashAccount"
ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'CASH';

DROP INDEX IF EXISTS "CashAccount_companyId_currency_key";
CREATE UNIQUE INDEX "CashAccount_companyId_currency_accountType_key"
ON "CashAccount"("companyId", "currency", "accountType");

ALTER TABLE "CashMovement"
ADD COLUMN "sourceAmount" DECIMAL(18,2),
ADD COLUMN "sourceCurrency" TEXT,
ADD COLUMN "exchangeRate" DECIMAL(18,6);

-- Preserve non-cash client receipts that were recorded before all payment
-- methods were connected to the treasury ledger.
WITH non_cash_accounts AS (
  SELECT p."companyId", p."currency", p."method"::text AS "accountType"
  FROM "Payment" p
  WHERE p."status" = 'RECEIVED'
    AND p."currency" IN ('CDF', 'USD')
    AND p."method"::text IN ('BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER')
  UNION
  SELECT e."companyId", e."currency", e."method"::text AS "accountType"
  FROM "Expense" e
  WHERE e."status" = 'RECORDED'
    AND e."cashVoucherId" IS NULL
    AND e."currency" IN ('CDF', 'USD')
    AND e."method"::text IN ('BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER')
)
INSERT INTO "CashAccount" (
  "id", "companyId", "currency", "accountType", "code", "name", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  n."companyId",
  n."currency",
  n."accountType",
  n."accountType" || '-' || n."currency",
  CASE n."accountType"
    WHEN 'BANK_TRANSFER' THEN 'Banque · virements '
    WHEN 'CARD' THEN 'Banque · cartes '
    WHEN 'MOBILE_MONEY' THEN 'Mobile money '
    ELSE 'Autres encaissements '
  END || n."currency",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM non_cash_accounts n
ON CONFLICT ("companyId", "currency", "accountType") DO NOTHING;

INSERT INTO "CashMovement" (
  "id", "companyId", "cashAccountId", "date", "direction", "amount",
  "sourceAmount", "sourceCurrency", "sourceType", "sourceId", "description", "reference", "createdAt"
)
SELECT
  gen_random_uuid(),
  p."companyId",
  a."id",
  p."createdAt",
  'IN'::"CashMovementDirection",
  p."amount",
  p."amount",
  p."currency",
  'INVOICE_PAYMENT',
  p."id",
  'Règlement client · ' || p."method"::text,
  p."reference",
  p."createdAt"
FROM "Payment" p
JOIN "CashAccount" a
  ON a."companyId" = p."companyId"
 AND a."currency" = p."currency"
 AND a."accountType" = p."method"::text
WHERE p."status" = 'RECEIVED'
  AND p."currency" IN ('CDF', 'USD')
  AND p."method"::text IN ('BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER')
ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING;

INSERT INTO "CashMovement" (
  "id", "companyId", "cashAccountId", "date", "direction", "amount",
  "sourceAmount", "sourceCurrency", "sourceType", "sourceId", "description", "createdAt"
)
SELECT
  gen_random_uuid(),
  e."companyId",
  a."id",
  e."date",
  'OUT'::"CashMovementDirection",
  e."amount",
  e."amount",
  e."currency",
  'EXPENSE',
  e."id",
  e."category" || ' · ' || COALESCE(e."description", 'Charge du cabinet'),
  e."createdAt"
FROM "Expense" e
JOIN "CashAccount" a
  ON a."companyId" = e."companyId"
 AND a."currency" = e."currency"
 AND a."accountType" = e."method"::text
WHERE e."status" = 'RECORDED'
  AND e."cashVoucherId" IS NULL
  AND e."currency" IN ('CDF', 'USD')
  AND e."method"::text IN ('BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER')
ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING;
