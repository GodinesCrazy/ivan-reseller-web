# P58 — Proof Ladder Progression

Date: 2026-03-24  
Sprint: P58 — Controlled Commercial Proof Path

## Allowed Values

| Stage | Meaning |
|-------|---------|
| listing_active_no_order_yet | Listing exists, no buyer order |
| order_ingested | Order created internally |
| supplier_purchase_attempted | Fulfillment invoked (PURCHASING, FAILED, etc.) |
| supplier_purchase_proved | PURCHASED + real aliexpressOrderId |
| tracking_attached | sale.trackingNumber present |
| delivered_truth_obtained | Sale DELIVERED or COMPLETED |
| released_funds_obtained | sale.payoutExecuted=true |
| realized_profit_obtained | payoutExecuted + netProfit > 0 |

## P58 Current Real Business Stage

**`listing_active_no_order_yet`**

### Evidence

- P50: matchingRecentOrders.count=0, internal mercadolibre: orders for productId 32690 = none
- P58: Live scripts blocked by DB connection limit; no new order data
- Listing state per P50: under_review / waiting_for_patch (drifted from P49 active)

### Classification Logic (from p50-monitor script)

```ts
function classifyStage(order, sale): FurthestStage {
  if (!order) return 'listing_active_no_order_yet';
  // ... then supplier_purchase_proved, tracking_attached, delivered, released, realized
}
```

## Stage Progression Path

```
listing_active_no_order_yet
    ↓ (real buyer order + sync/webhook)
order_ingested
    ↓ (fulfillOrder called)
supplier_purchase_attempted
    ↓ (real aliexpressOrderId)
supplier_purchase_proved
    ↓ (submit-tracking)
tracking_attached
    ↓ (marketplace delivered)
delivered_truth_obtained
    ↓ (payout executed)
released_funds_obtained
    ↓ (netProfit > 0)
realized_profit_obtained
```

## Next Stage When Order Arrives

When first real MercadoLibre order is ingested:

- Stage moves to `order_ingested`
- If `fulfillOrder` runs: `supplier_purchase_attempted`
- If AliExpress returns real order id: `supplier_purchase_proved`
