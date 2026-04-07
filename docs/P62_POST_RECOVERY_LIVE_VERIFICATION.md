# P62 — Post-recovery live verification

**Scope:** Product `32690`, listing `MLC3786354420`.

## Command

```text
cd backend
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

(Run twice after recovery; both agreed.)

## First post-recovery snapshot

- `generatedAt`: `2026-03-24T22:12:21.027Z`

## Second post-recovery snapshot (final monitor)

- `generatedAt`: `2026-03-24T22:12:37.851Z`

## Live ML item (`liveItem`)

| Field | Value |
|--------|--------|
| `status` | `active` |
| `sub_status` | `[]` |
| `health` | `null` |
| `permalink` | `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM` |
| Pictures | `630860-MLC109380016497_032026`, `635707-MLC108574302632_032026` |

## Permalink HTTP probe (`permalinkHeadStatus`)

- Value: **403** (both post-recovery runs)

This is **not** treated as contradicting API truth: the runbook does not equate anonymous HEAD success with sellability, and does not equate 403 with "not active." **Authoritative** fields for this sprint are `liveItem.status` and `liveItem.sub_status` from the MercadoLibre API used by `p50`.

## Local rows (from `p50`)

- `product.status`: `PUBLISHED`, `isPublished`: `true`
- `listing.status`: `active`

## Orders / commercial proof ladder

- `matchingRecentOrders.count`: `0`
- `latestSale`: `null`
- `furthestStage`: `listing_active_no_order_yet`

## Classification for Section 3

**`active_and_sellable`** (API-level): `status === active` and `sub_status` empty immediately after picture replacement and on two consecutive monitors.

Not applicable: `under_review`, `waiting_for_patch`, `blocked`, `drifted`, `unknown_due_runtime_issue`.
