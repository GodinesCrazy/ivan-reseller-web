-- AlterTable: Agregar campos de comprador a Sale
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "buyerEmail" TEXT,
ADD COLUMN IF NOT EXISTS "buyerName" TEXT,
ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;

-- CreateTable: PurchaseLog
CREATE TABLE IF NOT EXISTS "purchase_logs" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "orderId" TEXT,
    "productId" INTEGER,
    "supplierUrl" TEXT NOT NULL,
    "purchaseAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "supplierOrderId" TEXT,
    "trackingNumber" TEXT,
    "capitalValidated" BOOLEAN NOT NULL DEFAULT false,
    "capitalAvailable" DECIMAL(18,2),
    "paypalValidated" BOOLEAN NOT NULL DEFAULT false,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_logs_userId_status_idx" ON "purchase_logs"("userId", "status");
CREATE INDEX IF NOT EXISTS "purchase_logs_saleId_idx" ON "purchase_logs"("saleId");
CREATE INDEX IF NOT EXISTS "purchase_logs_status_createdAt_idx" ON "purchase_logs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "purchase_logs_createdAt_idx" ON "purchase_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "purchase_logs" ADD CONSTRAINT "purchase_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_logs" ADD CONSTRAINT "purchase_logs_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_logs" ADD CONSTRAINT "purchase_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

