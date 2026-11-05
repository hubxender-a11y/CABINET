CREATE TABLE "ArchiveBinder" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveBinder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ArchiveDocument"
ADD COLUMN "binderId" UUID;

CREATE UNIQUE INDEX "ArchiveBinder_companyId_category_fiscalYear_period_name_key"
ON "ArchiveBinder"("companyId", "category", "fiscalYear", "period", "name");

CREATE INDEX "ArchiveDocument_companyId_binderId_createdAt_idx"
ON "ArchiveDocument"("companyId", "binderId", "createdAt");

ALTER TABLE "ArchiveBinder"
ADD CONSTRAINT "ArchiveBinder_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveDocument"
ADD CONSTRAINT "ArchiveDocument_binderId_fkey"
FOREIGN KEY ("binderId") REFERENCES "ArchiveBinder"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
