ALTER TABLE "ArchiveBinder"
ADD COLUMN "personName" TEXT;

ALTER TABLE "ArchiveDocument"
ADD COLUMN "personName" TEXT,
ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ArchiveDocument_companyId_isPinned_deletedAt_idx"
ON "ArchiveDocument"("companyId", "isPinned", "deletedAt");
