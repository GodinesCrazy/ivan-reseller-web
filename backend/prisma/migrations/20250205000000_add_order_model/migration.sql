-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "productId" INTEGER,
    "title" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "shippingAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "paypalOrderId" TEXT,
    "aliexpressOrderId" TEXT,
    "productUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_paypalOrderId_idx" ON "orders"("paypalOrderId");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
