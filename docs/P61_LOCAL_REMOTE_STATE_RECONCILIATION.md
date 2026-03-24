# P61 — Local / Remote State Reconciliation

Compared at **2026-03-24T21:43:16.629Z** (output of `p50-monitor-ml-controlled-sale.ts`).

## Local DB (Postgres)

| Entity | Field | Value |
|--------|--------|--------|
| Product **32690** | `status` | **APPROVED** |
| Product **32690** | `isPublished` | **false** |
| Product **32690** | `publishedAt` | **null** |
| Marketplace listing **MLC3786354420** | `status` | **failed_publish** |
| Listing | `listingUrl` | Valid articulo.mercadolibre.cl permalink |

## Remote (MercadoLibre API)

| Field | Value |
|--------|--------|
| `status` | **under_review** |
| `sub_status` | **["waiting_for_patch"]** |
| Listing exists | **yes** (item id matches) |

## Drift analysis

1. **Local product `APPROVED` + `isPublished: false`** is internally inconsistent with “live sellable listing” — and matches **no** live `active` state.
2. **Local listing `failed_publish`** is a **coarse internal label**; it does **not** encode MercadoLibre **under_review / waiting_for_patch**. Remote truth is **stricter**: marketplace is holding the item for seller action.
3. **Live disagrees with any narrative “published and clean”** until `sub_status` clears and `status` becomes `active`.

Conclusion: **local rows are stale / semantically misaligned** with live marketplace truth. The DB is **not** authoritative for ML moderation state.

## Safe reconciliation path in repo

- **`p50-monitor-ml-controlled-sale.ts`**: **read-only** — does **not** write product or listing rows.
- **`operational-truth.service` / `p0-reconcile-operational-truth.ts`**: reconciles **product** status from **DB** listing rows (`status === 'active'` counts as verified). It does **not** pull MercadoLibre `under_review` into `marketplace_listings.status`. Running **`--execute`** affects **many** products — **not** run in this sprint for a single-listing fix.
- **`p49-reactivate-ml-listing.ts`**: intended path when operator is ready to **apply approved assets / updates** and drive ML back toward **active** (see P49 report). Use when policy and assets are ready — not a silent auto-reconcile.

## Minimal corrective action (operator)

1. Treat **live API** as source of truth for sellability: **waiting_for_patch** must be resolved in MercadoLibre (seller center / required changes).
2. Optionally align **local** `marketplace_listings.status` to a dedicated internal enum that reflects review (if product adds one); today **`failed_publish`** is misleading vs **under_review**.
3. After live shows **`active`** and `sub_status=[]`, re-run **p49** or listing sync flows already used in P49, then optional **p0** dry-run / targeted product update — **only** with scope limited to **32690** if introducing a script later.

## Reconciliation status

**Analysis complete; no destructive DB reconcile executed** (would be multi-product or misleading without ML-driven listing status write).
