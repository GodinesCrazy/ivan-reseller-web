# P63 — Commercial-ready handoff

## Monitor

```text
cd backend
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

**Latest captured `generatedAt`:** `2026-03-24T22:56:18.586Z`

## Proof ladder

| Signal | Value |
|--------|--------|
| `furthestStage` | `listing_active_no_order_yet` |
| `matchingRecentOrders.count` | `0` |
| `latestSale` | `null` |

**Label:** **`monitored_no_order_yet`**

## Commercial readiness

- **API:** Listing **`active`** with **no** `waiting_for_patch` at handoff snapshot.
- **Public automation:** **Cannot** assert buyer-visible PDP due to **challenge shell** (`permalinkPublicProbe.challengeShellDetected: true`). **Manual browser check** remains the buyer-fidelity gate before treating “public” as proven.

## If operators still see an ML error in a real browser

That scenario is **not** disproven by this sprint’s automation (challenge layer blocks machine verification). Collect a screenshot + exact URL + incognito vs logged-in state and escalate via **MercadoLibre seller support** with item id **`MLC3786354420`**.
