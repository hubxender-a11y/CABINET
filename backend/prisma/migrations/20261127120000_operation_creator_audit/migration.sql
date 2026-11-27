ALTER TABLE "PaymentOrder"
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "paidByName" TEXT;

ALTER TABLE "CashVoucher"
  ADD COLUMN "createdBy" UUID,
  ADD COLUMN "createdByName" TEXT,
  ADD COLUMN "paidByName" TEXT;

UPDATE "PaymentOrder" AS operation
SET "createdByName" = account."name"
FROM "User" AS account
WHERE operation."createdBy" = account."id"
  AND operation."createdByName" IS NULL;

UPDATE "CashVoucher" AS voucher
SET
  "createdBy" = operation."createdBy",
  "createdByName" = COALESCE(operation."createdByName", account."name")
FROM "PaymentOrder" AS operation
LEFT JOIN "User" AS account ON account."id" = operation."createdBy"
WHERE operation."cashVoucherId" = voucher."id"
  AND voucher."createdBy" IS NULL;

UPDATE "CashVoucher" AS voucher
SET
  "createdBy" = entry."userId",
  "createdByName" = account."name"
FROM "AuditLog" AS entry
LEFT JOIN "User" AS account ON account."id" = entry."userId"
WHERE entry."action" = 'CASH_VOUCHER_SUBMITTED_FOR_APPROVAL'
  AND entry."details"->>'voucherId' = voucher."id"::text
  AND voucher."createdBy" IS NULL;

UPDATE "PaymentOrder" AS operation
SET "paidByName" = account."name"
FROM "User" AS account
WHERE operation."paidBy" = account."id"
  AND operation."paidByName" IS NULL;

UPDATE "CashVoucher" AS voucher
SET "paidByName" = account."name"
FROM "AuditLog" AS entry
JOIN "User" AS account ON account."id" = entry."userId"
WHERE entry."action" IN ('CASH_VOUCHER_PAID', 'CASH_VOUCHER_APPROVED_AND_RELEASED')
  AND entry."details"->>'voucherId' = voucher."id"::text
  AND voucher."paidByName" IS NULL;
