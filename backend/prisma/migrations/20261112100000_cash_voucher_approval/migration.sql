ALTER TABLE "CashVoucher"
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "managerApprovalName" TEXT,
  ADD COLUMN "managerApprovalBy" UUID,
  ADD COLUMN "managerApprovedAt" TIMESTAMP(3),
  ADD COLUMN "managerRejectedAt" TIMESTAMP(3);

CREATE INDEX "CashVoucher_companyId_managerApprovalBy_idx"
  ON "CashVoucher"("companyId", "managerApprovalBy");
