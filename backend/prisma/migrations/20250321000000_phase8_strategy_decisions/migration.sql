-- Phase 8: AI Strategy Brain - strategy_decisions (productId, decisionType, score, reason, executed)
CREATE TABLE IF NOT EXISTS "strategy_decisions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "decisionType" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "strategy_decisions_userId_idx" ON "strategy_decisions"("userId");
CREATE INDEX IF NOT EXISTS "strategy_decisions_productId_idx" ON "strategy_decisions"("productId");
CREATE INDEX IF NOT EXISTS "strategy_decisions_decisionType_idx" ON "strategy_decisions"("decisionType");
CREATE INDEX IF NOT EXISTS "strategy_decisions_createdAt_idx" ON "strategy_decisions"("createdAt");
CREATE INDEX IF NOT EXISTS "strategy_decisions_executed_idx" ON "strategy_decisions"("executed");

ALTER TABLE "strategy_decisions" ADD CONSTRAINT "strategy_decisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy_decisions" ADD CONSTRAINT "strategy_decisions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
