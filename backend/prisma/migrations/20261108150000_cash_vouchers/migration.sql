CREATE TABLE "CashVoucher" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "method" "PaymentMethod" NOT NULL,
    "accountCode" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashVoucher_companyId_voucherNumber_key"
ON "CashVoucher"("companyId", "voucherNumber");

CREATE INDEX "CashVoucher_companyId_date_idx"
ON "CashVoucher"("companyId", "date");

CREATE INDEX "CashVoucher_companyId_status_date_idx"
ON "CashVoucher"("companyId", "status", "date");

ALTER TABLE "CashVoucher"
ADD CONSTRAINT "CashVoucher_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
