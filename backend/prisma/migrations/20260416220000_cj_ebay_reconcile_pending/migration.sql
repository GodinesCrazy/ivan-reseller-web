-- Migration: cj_ebay_reconcile_pending
-- Adds reconcileAttempts and reconcileRetryAfter to cj_ebay_listings.
-- Supports RECONCILE_PENDING state for robust offer reconciliation.

ALTER TABLE "cj_ebay_listings" ADD COLUMN "reconcile_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cj_ebay_listings" ADD COLUMN "reconcile_retry_after" TIMESTAMP(3);
