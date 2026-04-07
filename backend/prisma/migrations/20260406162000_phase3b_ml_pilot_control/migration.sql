CREATE TABLE "pilot_launch_approvals" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "marketplace" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "requestedMode" TEXT NOT NULL,
  "decision" TEXT NOT NULL DEFAULT 'approved',
  "approvedBy" TEXT NOT NULL,
  "reason" TEXT,
  "evidenceSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "pilot_launch_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pilot_category_allowlists" (
  "id" SERIAL NOT NULL,
  "marketplace" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "categoryKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pilot_category_allowlists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pilot_decision_ledgers" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "marketplace" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "publishIntent" TEXT NOT NULL,
  "requestedMode" TEXT NOT NULL,
  "modeResolved" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "approvalId" TEXT,
  "blockers" JSONB,
  "warnings" JSONB,
  "programVerificationSnapshot" JSONB,
  "pilotReadinessSnapshot" JSONB,
  "evidenceSnapshot" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_decision_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pilot_control_states" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "marketplace" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ready',
  "reason" TEXT,
  "evidenceSnapshot" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pilot_control_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pilot_category_allowlists_marketplace_siteId_categoryKey_key"
ON "pilot_category_allowlists"("marketplace", "siteId", "categoryKey");

CREATE UNIQUE INDEX "pilot_control_states_userId_marketplace_productId_key"
ON "pilot_control_states"("userId", "marketplace", "productId");

CREATE INDEX "pilot_launch_approvals_userId_marketplace_decision_expiresAt_idx"
ON "pilot_launch_approvals"("userId", "marketplace", "decision", "expiresAt");

CREATE INDEX "pilot_launch_approvals_productId_marketplace_idx"
ON "pilot_launch_approvals"("productId", "marketplace");

CREATE INDEX "pilot_category_allowlists_marketplace_siteId_enabled_idx"
ON "pilot_category_allowlists"("marketplace", "siteId", "enabled");

CREATE INDEX "pilot_decision_ledgers_userId_marketplace_createdAt_idx"
ON "pilot_decision_ledgers"("userId", "marketplace", "createdAt");

CREATE INDEX "pilot_decision_ledgers_productId_marketplace_createdAt_idx"
ON "pilot_decision_ledgers"("productId", "marketplace", "createdAt");

CREATE INDEX "pilot_decision_ledgers_result_createdAt_idx"
ON "pilot_decision_ledgers"("result", "createdAt");

CREATE INDEX "pilot_control_states_marketplace_state_idx"
ON "pilot_control_states"("marketplace", "state");

ALTER TABLE "pilot_launch_approvals"
ADD CONSTRAINT "pilot_launch_approvals_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pilot_launch_approvals"
ADD CONSTRAINT "pilot_launch_approvals_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pilot_decision_ledgers"
ADD CONSTRAINT "pilot_decision_ledgers_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pilot_decision_ledgers"
ADD CONSTRAINT "pilot_decision_ledgers_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pilot_decision_ledgers"
ADD CONSTRAINT "pilot_decision_ledgers_approvalId_fkey"
FOREIGN KEY ("approvalId") REFERENCES "pilot_launch_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pilot_control_states"
ADD CONSTRAINT "pilot_control_states_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pilot_control_states"
ADD CONSTRAINT "pilot_control_states_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
