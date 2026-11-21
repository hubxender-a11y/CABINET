CREATE TABLE "CompanyEmailIntegration" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyEmailIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyEmailIntegration_companyId_key"
    ON "CompanyEmailIntegration"("companyId");

CREATE TABLE "MailOAuthState" (
    "id" VARCHAR(64) NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MailOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailOAuthState_expiresAt_idx" ON "MailOAuthState"("expiresAt");

ALTER TABLE "CompanyEmailIntegration"
    ADD CONSTRAINT "CompanyEmailIntegration_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailOAuthState"
    ADD CONSTRAINT "MailOAuthState_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
