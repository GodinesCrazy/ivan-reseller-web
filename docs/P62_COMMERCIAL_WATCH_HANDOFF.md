# P62 — Commercial watch handoff

**Precondition:** Live listing `MLC3786354420` is **`active`** with **`sub_status: []`** (met after this sprint).

## Monitors executed (post-recovery)

```text
cd backend
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

- First post-recovery: `2026-03-24T22:12:21.027Z`
- Second post-recovery: `2026-03-24T22:12:37.851Z`

## Handoff state

| Check | Result |
|--------|--------|
| Listing API sellable | Yes (`active`, empty `sub_status`) |
| Buyer orders ingested (`matchingRecentOrders`) | **0** |
| Internal ML orders | **None** |
| `furthestStage` | `listing_active_no_order_yet` |

## Proof-ladder label

**`monitored_no_order_yet`** — system is in the correct stage to watch for the first real buyer order; no order has been ingested yet.

## Note on permalink HEAD

`permalinkHeadStatus` remained **403** in `p50`; commercial monitoring should continue to rely on **orders** and **API listing state**, not anonymous browser/HEAD behavior.
