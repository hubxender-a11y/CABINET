-- A cancelled/deleted invoice payment must no longer affect the cash book.
-- Keep active payment movements; remove legacy receipts and reversals for
-- payments that were cancelled or removed before cancellation cleanup shipped.
DELETE FROM "CashMovement" AS movement
WHERE movement."sourceType" IN ('INVOICE_PAYMENT', 'INVOICE_PAYMENT_REVERSAL')
  AND (
    NOT EXISTS (
      SELECT 1
      FROM "Payment" AS payment
      WHERE payment."id"::text = movement."sourceId"
        AND payment."companyId" = movement."companyId"
    )
    OR EXISTS (
      SELECT 1
      FROM "Payment" AS payment
      WHERE payment."id"::text = movement."sourceId"
        AND payment."companyId" = movement."companyId"
        AND payment."status" = 'CANCELLED'
    )
  );
