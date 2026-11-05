CREATE TABLE "FixedAsset" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "acquisitionCost" DECIMAL(18,2) NOT NULL,
    "residualValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CDF',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedTo" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FixedAssetMovement" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "movementType" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromAssignee" TEXT,
    "toAssignee" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArchiveDocument" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID,
    "category" TEXT NOT NULL,
    "binder" TEXT,
    "fiscalYear" INTEGER NOT NULL,
    "period" TEXT,
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "documentDate" TIMESTAMP(3),
    "description" TEXT,
    "data" BYTEA NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FixedAsset_companyId_assetNumber_key"
ON "FixedAsset"("companyId", "assetNumber");

CREATE INDEX "FixedAsset_companyId_status_name_idx"
ON "FixedAsset"("companyId", "status", "name");

CREATE INDEX "FixedAssetMovement_companyId_assetId_movementDate_idx"
ON "FixedAssetMovement"("companyId", "assetId", "movementDate");

CREATE INDEX "ArchiveDocument_companyId_category_fiscalYear_period_createdAt_idx"
ON "ArchiveDocument"("companyId", "category", "fiscalYear", "period", "createdAt");

CREATE INDEX "ArchiveDocument_companyId_customerId_createdAt_idx"
ON "ArchiveDocument"("companyId", "customerId", "createdAt");

CREATE INDEX "ArchiveDocument_companyId_deletedAt_idx"
ON "ArchiveDocument"("companyId", "deletedAt");

ALTER TABLE "FixedAsset"
ADD CONSTRAINT "FixedAsset_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixedAssetMovement"
ADD CONSTRAINT "FixedAssetMovement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FixedAssetMovement"
ADD CONSTRAINT "FixedAssetMovement_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveDocument"
ADD CONSTRAINT "ArchiveDocument_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveDocument"
ADD CONSTRAINT "ArchiveDocument_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
