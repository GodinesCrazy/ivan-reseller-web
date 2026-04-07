# P60 — Waiting_for_patch Execution

Date: 2026-03-24  
Sprint: P60 — Runtime Recovery + Listing Stability

## Objective

If waiting_for_patch still exists, execute the recovery path.

## Precondition

**DB headroom required.** The p49 reactivation script needs DB for product, listing, asset pack, credentials.

## P60 Execution Attempt

**Command:** `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`

**Not run.** DB exhaustion would cause immediate failure. No point executing until headroom is restored.

## Recovery Path (when DB available)

1. **Verify asset pack:** `npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
2. **Run reactivation:** `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420`
3. **Script flow:** Replace pictures → activate if needed → sync local row
4. **Expected outcome:** classification `listing_active_policy_clean` or isolate blocker

## Blocker Classification (if recovery fails)

| Blocker | Meaning |
|---------|---------|
| marketplace-side delayed review | ML has not processed patch yet |
| renewed policy issue | New or recurring image/category policy trigger |
| local/remote state drift | Local says one thing; ML API says another |
| another ML-side restriction | Category, shipping, or other ML rule |

## P60 Status

**Not executed** — blocked by DB. No fabrication of recovery.
