# P95 — Publish Preflight Rerun

## Product: 32714

## Preflight Execution

`buildMercadoLibrePublishPreflight` was executed at 2026-03-26T20:34 UTC.

### Result Summary

| Field | Value |
|---|---|
| `overallState` | `blocked_marketplace_connection` |
| `publishAllowed` | `false` |
| `productStatus` | `VALIDATED_READY` |
| `listingSalePriceUsd` | $7.02 |

### Blockers (4 total)

1. `mercadolibre_test_connection_failed` — ML API test connection fails (token may need refresh)
2. `images:ml_canonical_dual_gate_failed_all_candidates_and_remediations` — image remediation pipeline cannot produce compliant assets
3. `pricing:real profit -2.07 must be > 0 (sale 7.02 vs total cost 9.09)` — negative profit
4. (implicit) postsale webhook issues

### Comparison vs P94 Blocked Result

| Check | P94 | P95 |
|---|---|---|
| Product Status | `PENDING` ❌ → blocked_product_status | `VALIDATED_READY` ✅ |
| mlChileFreight | Missing ❌ | Present ✅ (`freight_truth_ready_for_publish`) |
| Canonical Freight Truth | N/A (never reached) | `ok: true` ✅ |
| ML Credentials | present + active | present + active ✅ |
| ML API testConnection | not tested | `false` ❌ |
| Language | not tested | `supported: true` ✅ (es/CL) |
| Images publishSafe | not tested | `false` ❌ (0 images compliant) |
| Economics/Pricing | blocked by freight | `-$2.07 profit` ❌ |

### Progress Made

The P94 blocker was `blocked_product_status` because mlChileFreight was missing, which prevented VALIDATED_READY.

P95 resolved:
- ✅ mlChileFreight persisted
- ✅ Product promoted to VALIDATED_READY
- ✅ Canonical freight truth passes validation
- ✅ Language resolved (Spanish for CL)
- ✅ Credentials present and active

Now the preflight has moved past `blocked_product_status` to deeper checks where **3 new blockers** are exposed.
