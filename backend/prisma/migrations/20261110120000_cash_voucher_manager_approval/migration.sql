ALTER TABLE "CashVoucher"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL',
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "managerApprovalName" TEXT,
  ADD COLUMN "managerApprovalBy" UUID,
  ADD COLUMN "managerApprovedAt" TIMESTAMP(3),
  ADD COLUMN "managerRejectedAt" TIMESTAMP(3);
