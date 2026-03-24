# P61 — Exact Blocker Snapshot

Single snapshot after ML auth verification + live listing recheck + monitor rerun.  
Time reference: **2026-03-24T21:43Z** (UTC-ish in logs).

## One-line blocker

**MercadoLibre listing MLC3786354420 is `under_review` with `waiting_for_patch`; no buyer order; local DB listing/product fields are stale vs live API.**

## Layered truth

| Layer | State |
|--------|--------|
| **ML OAuth / runtime** | **Healthy** — `users/me` 200, tokens present, `runtimeUsable: true` |
| **Live listing sellability** | **Blocked** — `under_review` + `waiting_for_patch` |
| **Local product 32690** | `APPROVED`, `isPublished: false` — does not reflect live “active listing” |
| **Local listing row** | `failed_publish` — does not encode `under_review` |
| **Orders** | **0** ML-matching recent orders; **0** internal `mercadolibre:` orders |

## Proof-ladder stage (honest)

- **Furthest reached:** **`monitored_no_order_yet`** (no order ingested).  
- **Upstream gate:** Listing **not** `active_and_sellable` until ML clears review.

## What is *not* the blocker

- **Not** “invalid access token / 401” on `getItem` for this run — auth path verified.
- **Not** missing OAuth callback-only success — DB credential `updatedAt` corroborates persistence.

## Next single move (highest leverage)

Resolve **`waiting_for_patch`** for **MLC3786354420** in MercadoLibre (seller-facing requirements), then when live shows **`active`** and empty `sub_status`, re-run **`p49-reactivate-ml-listing.ts`** if imagery/policy updates are needed, then **`p50-monitor-ml-controlled-sale.ts`** until the first real order appears.
