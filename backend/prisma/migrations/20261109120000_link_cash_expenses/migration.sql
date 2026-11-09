ALTER TABLE "Expense"
ADD COLUMN "cashVoucherId" UUID,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECORDED',
ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Expense_cashVoucherId_key"
ON "Expense"("cashVoucherId");
CREATE INDEX "Expense_companyId_status_date_idx"
ON "Expense"("companyId", "status", "date");

ALTER TABLE "Expense"
ADD CONSTRAINT "Expense_cashVoucherId_fkey"
FOREIGN KEY ("cashVoucherId") REFERENCES "CashVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
