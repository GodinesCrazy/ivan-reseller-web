# P69 — Seller-side verification

## Automation capability

This repository does **not** expose an API that returns Mercado Libre **seller-center photo moderation copy** or “warning cleared” as structured data. **`items` GET** can show **`active`** and empty **`sub_status`** while the seller UI still displays a photo notice.

## Classification for P69

**`unknown_due_missing_operator_confirmation`**

## Minimum operator confirmation (verbatim evidence)

1. Open **Mercado Libre seller** (same account as listing owner for product `32690`).
2. Navigate to listing **`MLC3786354420`** (or its editor / quality panel).
3. Record:
   - Whether **any** photo / gallery warning is visible (**yes / no**).
   - **Exact** warning text if present (copy-paste).
   - **Date/time** of observation.

Until that is captured, P69 **cannot** claim `seller_warning_cleared` or `seller_warning_persists` beyond API-level signals.

## API-level signal (non-proof)

Post-replacement **`p49`** and **`p50`** snapshots: **`status: active`**, **`sub_status: []`** — supportive but **not** seller-warning clearance proof.
