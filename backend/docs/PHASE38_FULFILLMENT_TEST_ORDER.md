# Phase 38 — Test Order for Post-Sale Fulfillment Validation

This document describes the **real order** used to validate the Post-Sale Fulfillment Guarantee Engine (Phase 38).

## Order details (eBay)

| Field | Value |
|-------|--------|
| **Marketplace** | eBay |
| **Order ID (Pedido)** | `17-14370-63716` |
| **Item** | Caja de reloj de almacenamiento (watch storage box), glass lid |
| **SKU** | IVAN-31897 |
| **Sold price** | USD 56.42 |
| **Shipping charged** | USD 4.99 |
| **Total** | USD 61.41 |
| **Sale date** | 2026-03-18 01:47 |
| **Ship-by date** | 2026-03-20 |
| **Payment** | Paid (buyer paid; eBay holds funds until delivery) |

## Buyer / shipping

- **Name:** Jenuin Santana Navarro (eBay username: jensantana_0)
- **Address (use exactly for AliExpress):**
  - calle 12 par. 41 San Isidro
  - Canovanas, PR 00729-2831
  - United States

Use this exact address when filling supplier (AliExpress) shipping data in **Task 5 (Auto Purchase Execution)** or manual fulfillment.

## Validation tasks (Phase 38)

1. **Task 1 (Verify Sale):** Confirm order `17-14370-63716` exists in DB and status = paid.
2. **Task 5 (Auto Purchase):** Shipping data must be: `Jenuin Santana Navarro, calle 12 par. 41 San Isidro, Canovanas, PR 00729-2831, US`.
3. **Task 14 (Profit Protection):** Compare total collected (USD 61.41) vs supplier cost; ensure margin ≥ MIN_ALLOWED_MARGIN before auto-buy.
4. **Task 17 (Validate Current Order):** Confirm order exists in DB, purchase executed (or manual path), tracking present, marketplace updated.

## Known failure: ship-from address (manual fallback)

eBay “Ship your order” page for this order may show:

- **Error:** “Your ship from address must be in the United States to purchase a label.”
- **Cause:** Ship-from/return address is in Chile (e.g. Concepcion BioBio 4070008). eBay cannot issue a US label for an item shipping from outside the US under that flow.
- **Expected behavior (Phase 38 Task 11):** System should detect that automated label purchase is not available and use **manual fallback**: order appears in **Orders to Fulfill** (Compras pendientes) with “Action required” and user completes shipping manually (e.g. ship from Chile via carrier that supports it, or adjust ship-from address in eBay if allowed).
- **Task 9 (Frontend):** This order must appear in the “Orders to Fulfill” section with a clear **required action** (e.g. “Address or shipping method needs manual review”).

## References

- Fulfillment flow: [order-fulfillment.service.ts](../src/services/order-fulfillment.service.ts)
- Pending purchases API: `GET /api/sales/pending-purchases`
- UI: Compras pendientes / Orders to Fulfill [PendingPurchases.tsx](../../frontend/src/pages/PendingPurchases.tsx)
