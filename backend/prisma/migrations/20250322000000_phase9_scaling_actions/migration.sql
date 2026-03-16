-- Phase 9: Autonomous Scaling Engine - scaling_actions (productId, marketplace, actionType, score, executed)
CREATE TABLE IF NOT EXISTS "scaling_actions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "marketplace" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "executed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scaling_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scaling_actions_userId_idx" ON "scaling_actions"("userId");
CREATE INDEX IF NOT EXISTS "scaling_actions_productId_idx" ON "scaling_actions"("productId");
CREATE INDEX IF NOT EXISTS "scaling_actions_marketplace_idx" ON "scaling_actions"("marketplace");
CREATE INDEX IF NOT EXISTS "scaling_actions_actionType_idx" ON "scaling_actions"("actionType");
CREATE INDEX IF NOT EXISTS "scaling_actions_createdAt_idx" ON "scaling_actions"("createdAt");
CREATE INDEX IF NOT EXISTS "scaling_actions_executed_idx" ON "scaling_actions"("executed");

ALTER TABLE "scaling_actions" ADD CONSTRAINT "scaling_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scaling_actions" ADD CONSTRAINT "scaling_actions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
