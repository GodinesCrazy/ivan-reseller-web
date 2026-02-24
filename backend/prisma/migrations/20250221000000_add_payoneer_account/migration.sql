-- CreateTable
CREATE TABLE "payoneer_accounts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "balance" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payoneer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payoneer_accounts_accountId_key" ON "payoneer_accounts"("accountId");

-- CreateIndex
CREATE INDEX "payoneer_accounts_isActive_idx" ON "payoneer_accounts"("isActive");
