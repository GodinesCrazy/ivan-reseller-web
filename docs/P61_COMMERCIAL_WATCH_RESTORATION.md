# P61 — Commercial Watch Restoration

## Goal

Restore the **controlled commercial watch** after auth + listing truth checks — i.e. rerun the monitor script and record order truth.

## Command

```bash
cd backend
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

## Result: **watch restored (script operational)**

| Metric | Value |
|--------|--------|
| Exit code | **0** |
| `matchingRecentOrders.count` | **0** |
| `syncResult.created` | **0** |
| `syncResult.fetched` | **0** |
| Internal `orders` (`mercadolibre:` prefix, product 32690) | **[]** |
| `latestSale` | **null** |
| Script `furthestStage` | `listing_active_no_order_yet` |

## Honest commercial stage

- **No real buyer order** exists in MercadoLibre recent-order scan for this listing.
- **No internal order rows** for this controlled path.
- Per sprint rules: stop at **`monitored_no_order_yet`** — **not** fabricating order or post-sale proof.

## Naming caveat

The script’s `furthestStage` value **`listing_active_no_order_yet`** is a **coarse enum**; **live ML status is not `active`** (it is **under_review / waiting_for_patch**). Operational meaning for humans:

- **Monitor pipeline:** OK (auth + API calls succeed).  
- **Commercial sellability:** **blocked** by marketplace review until patch clears.

## Classification

**monitored_no_order_yet** (honest) + parallel blocker **waiting_for_patch** on the listing.
