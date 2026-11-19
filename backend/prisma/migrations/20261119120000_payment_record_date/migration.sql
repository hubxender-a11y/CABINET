ALTER TABLE "Payment"
ADD COLUMN "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Payment"
SET "paymentDate" = "createdAt";

CREATE INDEX "Payment_companyId_paymentDate_idx"
ON "Payment"("companyId", "paymentDate");
