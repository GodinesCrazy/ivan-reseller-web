-- FASE 3F: Payment guardrail (saldo insuficiente CJ) + devoluciones/refunds
-- Applied via `prisma db push` on 2026-04-15

-- Add paymentBlockReason to cj_ebay_orders
ALTER TABLE "cj_ebay_orders" ADD COLUMN IF NOT EXISTS "paymentBlockReason" TEXT;

-- Create cj_ebay_order_refunds table
CREATE TABLE IF NOT EXISTS "cj_ebay_order_refunds" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "orderId"       TEXT NOT NULL,
    "userId"        INTEGER NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'RETURN_REQUESTED',
    "refundType"    TEXT NOT NULL DEFAULT 'FULL',
    "amountUsd"     DECIMAL(18,2),
    "reason"        TEXT,
    "ebayReturnId"  TEXT,
    "cjRefundRef"   TEXT,
    "notes"         TEXT,
    "events"        JSONB,
    "resolvedAt"    TIMESTAMP(3),
    "lastError"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "cj_ebay_order_refunds_orderId_idx" ON "cj_ebay_order_refunds"("orderId");
CREATE INDEX IF NOT EXISTS "cj_ebay_order_refunds_userId_status_idx" ON "cj_ebay_order_refunds"("userId", "status");

ALTER TABLE "cj_ebay_order_refunds"
    ADD CONSTRAINT "cj_ebay_order_refunds_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "cj_ebay_orders"("id") ON DELETE CASCADE;

ALTER TABLE "cj_ebay_order_refunds"
    ADD CONSTRAINT "cj_ebay_order_refunds_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
