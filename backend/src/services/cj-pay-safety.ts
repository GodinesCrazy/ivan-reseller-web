/**
 * Operational guardrails for real CJ payBalance execution (no secrets in logs).
 */
import type { SupplierPayOutcome } from './supplier-fulfillment.types';

function toNumberUsd(price: unknown): number {
  if (price == null) return NaN;
  return Number(price);
}

function parseAllowlist(): Set<string> | null {
  const raw = String(process.env.CJ_PAY_ORDER_ID_ALLOWLIST || '').trim();
  if (!raw) return null;
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(ids);
}

export type CjPaySafetyResult =
  | { ok: true }
  | { ok: false; reason: string; outcome: SupplierPayOutcome };

/**
 * Extra checks before calling CJ payBalance. When not OK, do not charge.
 */
export function evaluateCjPayExecutionSafety(order: {
  id: string;
  price: unknown;
}): CjPaySafetyResult {
  const allow = parseAllowlist();
  if (allow && !allow.has(order.id)) {
    return {
      ok: false,
      reason: 'Order id not in CJ_PAY_ORDER_ID_ALLOWLIST',
      outcome: 'payment_unsafe_to_execute',
    };
  }

  const maxUsd = String(process.env.CJ_PAY_MAX_ORDER_USD || '').trim();
  if (maxUsd) {
    const cap = Number(maxUsd);
    if (Number.isFinite(cap) && cap > 0) {
      const p = toNumberUsd(order.price ?? undefined);
      if (!Number.isFinite(p) || p > cap) {
        return {
          ok: false,
          reason: `Order price exceeds CJ_PAY_MAX_ORDER_USD (${cap}) or is invalid`,
          outcome: 'payment_unsafe_to_execute',
        };
      }
    }
  }

  const requireToken = String(process.env.CJ_PAY_REQUIRE_CONFIRM_TOKEN || '')
    .trim()
    .toLowerCase();
  if (requireToken === 'true' || requireToken === '1') {
    const expected = String(process.env.CJ_PAY_CONFIRM_TOKEN || '').trim();
    if (!expected) {
      return {
        ok: false,
        reason: 'CJ_PAY_REQUIRE_CONFIRM_TOKEN is set but CJ_PAY_CONFIRM_TOKEN is empty',
        outcome: 'payment_unsafe_to_execute',
      };
    }
  }

  return { ok: true };
}

/**
 * Validates confirm token when CJ_PAY_REQUIRE_CONFIRM_TOKEN=true.
 */
export function evaluateCjPayConfirmToken(payConfirmToken: string | undefined): CjPaySafetyResult {
  const requireToken = String(process.env.CJ_PAY_REQUIRE_CONFIRM_TOKEN || '')
    .trim()
    .toLowerCase();
  if (requireToken !== 'true' && requireToken !== '1') {
    return { ok: true };
  }
  const expected = String(process.env.CJ_PAY_CONFIRM_TOKEN || '').trim();
  if (!expected) {
    return {
      ok: false,
      reason: 'CJ_PAY_CONFIRM_TOKEN must be set when CJ_PAY_REQUIRE_CONFIRM_TOKEN=true',
      outcome: 'payment_unsafe_to_execute',
    };
  }
  const got = String(payConfirmToken || '').trim();
  if (got !== expected) {
    return {
      ok: false,
      reason: 'payConfirmToken mismatch or missing',
      outcome: 'payment_unsafe_to_execute',
    };
  }
  return { ok: true };
}
