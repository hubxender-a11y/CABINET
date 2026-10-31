ALTER TABLE "Purchase"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CDF';

ALTER TABLE "PurchaseItem"
ADD COLUMN "productId" UUID;

CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

ALTER TABLE "PurchaseItem"
ADD CONSTRAINT "PurchaseItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
