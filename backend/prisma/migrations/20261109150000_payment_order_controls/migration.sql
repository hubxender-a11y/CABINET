ALTER TYPE "PaymentOrderStatus" ADD VALUE 'PAID';

ALTER TABLE "PaymentOrder"
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidBy" UUID,
ADD COLUMN "cashVoucherId" UUID;

CREATE UNIQUE INDEX "PaymentOrder_cashVoucherId_key" ON "PaymentOrder"("cashVoucherId");

ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_cashVoucherId_fkey"
FOREIGN KEY ("cashVoucherId") REFERENCES "CashVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentOrderAttachment" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "paymentOrderId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentOrderAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentOrderAttachment_paymentOrderId_key" ON "PaymentOrderAttachment"("paymentOrderId");
CREATE INDEX "PaymentOrderAttachment_companyId_createdAt_idx" ON "PaymentOrderAttachment"("companyId", "createdAt");

ALTER TABLE "PaymentOrderAttachment" ADD CONSTRAINT "PaymentOrderAttachment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentOrderAttachment" ADD CONSTRAINT "PaymentOrderAttachment_paymentOrderId_fkey"
FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
