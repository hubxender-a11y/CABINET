ALTER TABLE "PaymentOrder"
ADD COLUMN "expenseCategory" TEXT;

CREATE TABLE "PaymentOrderBudget" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "budgetAccount" TEXT NOT NULL,
    "initialForecast" DECIMAL(18,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentOrderBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentOrderAccountingRule" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "budgetAccount" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentOrderAccountingRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentOrderBudget_companyId_year_currency_budgetAccount_key"
ON "PaymentOrderBudget"("companyId", "year", "currency", "budgetAccount");

CREATE INDEX "PaymentOrderBudget_companyId_year_currency_isActive_idx"
ON "PaymentOrderBudget"("companyId", "year", "currency", "isActive");

CREATE UNIQUE INDEX "PaymentOrderAccountingRule_companyId_categoryKey_key"
ON "PaymentOrderAccountingRule"("companyId", "categoryKey");

CREATE INDEX "PaymentOrderAccountingRule_companyId_isActive_idx"
ON "PaymentOrderAccountingRule"("companyId", "isActive");

ALTER TABLE "PaymentOrderBudget"
ADD CONSTRAINT "PaymentOrderBudget_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentOrderAccountingRule"
ADD CONSTRAINT "PaymentOrderAccountingRule_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
