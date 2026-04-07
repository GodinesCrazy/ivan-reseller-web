# P91 — Order → fulfill proof exercise

## Relevant code (inspected, not executed for this SKU)

- Webhook path creates/updates sales/orders via `recordSaleFromWebhook` → downstream fulfillment (`FINAL_AUDIT_EXECUTIVE_SUMMARY.md` alignment).  
- `orderFulfillmentService.fulfillOrder` invoked from orders API, autopilot, retry services, etc.  
- **Internal harness:** `POST /api/internal/test-post-sale-flow` (`test-post-sale-flow.handler.ts`) — **simulate** path avoids real purchase; **real** path calls `fulfillOrder` but selects **`findFirst` product** for user (`APPROVED`/`PUBLISHED`), **not** wired to AliExpress `1005009130509159` by default.

## Exercise for candidate gray / 1005009130509159

**NOT EXECUTED.**

- No synthetic order tied to this listing.  
- No dry-run output captured.  
- No `fulfillOrder` trace for this product.

## Classification

**fulfill_not_proven** for this specific candidate.

## Note on dry-run option

To use the internal test flow **for this candidate**, the handler would need a **product row** for this URL/SKU in an eligible status, or a **dedicated** internal endpoint/body field to pin `productId` (currently not used in the excerpted logic) — **out of scope for P91 doc-only closure**; operator should use staging DB + targeted product or extend handler with explicit `productId`.

## Minimum next action

After **listing exists** for this SKU on ML: supervised **test buy** or **signed webhook fixture** → confirm **Order** row → run **controlled** `fulfillOrder` (dry-run or sandbox DS) and capture terminal state + supplier id or error.
