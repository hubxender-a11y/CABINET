CREATE TYPE "PaymentOrderStatus" AS ENUM ('SUBMITTED', 'FINANCE_APPROVED', 'APPROVED', 'REJECTED');

CREATE TABLE "PaymentOrder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requestingService" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountInWords" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "reason" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "accountingAllocation" TEXT NOT NULL,
    "budgetAccount" TEXT NOT NULL,
    "initialForecast" DECIMAL(18,2) NOT NULL,
    "availableBefore" DECIMAL(18,2) NOT NULL,
    "outstanding" DECIMAL(18,2) NOT NULL,
    "availableAfter" DECIMAL(18,2) NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "financeVisaName" TEXT,
    "financeVisaBy" UUID,
    "financeVisaAt" TIMESTAMP(3),
    "managerVisaName" TEXT,
    "managerVisaBy" UUID,
    "managerVisaAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentOrder_companyId_orderNumber_key" ON "PaymentOrder"("companyId", "orderNumber");
CREATE INDEX "PaymentOrder_companyId_date_idx" ON "PaymentOrder"("companyId", "date");
CREATE INDEX "PaymentOrder_companyId_status_date_idx" ON "PaymentOrder"("companyId", "status", "date");
CREATE INDEX "PaymentOrder_companyId_budgetAccount_status_idx" ON "PaymentOrder"("companyId", "budgetAccount", "status");

ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
