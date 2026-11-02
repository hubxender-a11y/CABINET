ALTER TABLE "Company"
ADD COLUMN "invoiceTemplate" JSONB NOT NULL
DEFAULT '{"version":1,"elements":[]}'::jsonb;
