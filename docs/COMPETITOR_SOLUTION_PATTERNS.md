# Competitor Solution Patterns

Date: 2026-03-21
Method: Practical reverse engineering from official competitor docs and product-help surfaces, not marketing summaries

## Problem-Class Comparison

| Problem class | Competitor pattern | Our current equivalent | Relative position | Concrete adaptation here |
| --- | --- | --- | --- | --- |
| 1. No stock for destination | AutoDS places products `On Hold` when supplier stock drops below threshold or shipping days exceed the configured limit; DSers maps suppliers by destination country and variant | We validate hard, but our live catalog lacks persisted destination and shipping truth at scale | Weaker | Add destination-first readiness thresholds and put products into a non-publishable hold state whenever destination, stock, or shipping truth goes stale |
| 2. Margin invalid / weak margin | AutoDS combines supplier cost, fees, shipping, and break-even rules into automated pricing settings | Our fee logic is stronger than average, but live inputs are incomplete | Mixed: logic stronger, runtime weaker | Keep our fee-complete gate, but require input completeness before products can remain approved |
| 3. Supplier substitution / fallback | DSers advanced mapping and AutoDS sourcing both lock future orders to a chosen quote or mapped variant; fallback is curated, not open-ended | We have alternative AliExpress lookup, but not destination-scoped mapping at order level | Weaker | Add destination-scoped supplier mapping and persist the chosen variant/quote for future orders |
| 4. Shipping / local warehouse handling | DSers maps per destination and `ships from`; AutoDS lets operators choose carrier and shipping-country preferences | We know destination matters, but we do not persist enough ship-to/ship-from truth in the candidate funnel | Weaker | Prefer candidates with local or near-destination warehouse support and persist chosen ship-to and ship-from assumptions |
| 5. Product ranking / low-risk first-product strategy | AutoDS and Zendrop bias toward hand-picked, filtered, lower-risk catalog slices instead of broad weak ingestion | We have discovery breadth, but not enough risk-constrained first-profit focus | Weaker | Run a narrower first-profit playbook: low-variation, light, non-branded, low-return-risk products only |
| 6. Order sync and post-sale truth | DSers and Zendrop separate order states such as awaiting order, awaiting payment, unpaid, issues, tracking, delivered | Our truth model is stronger on cancellation honesty, but weaker on visible payment-state granularity | Mixed | Preserve our truth flags and add explicit operational reporting for unpaid, unlinked, payment-pending, and proof-ineligible states |
| 7. Supplier auto-purchase orchestration | DSers bulk orders require mapped variants and shipping method before placement; Zendrop supports immediate or daily batch auto-fulfillment; AutoDS supports auto-order plus semi-automation | We already have fulfillment orchestration and cron-driven paid-order processing | Strong in architecture, weak in proof | Keep our automation core, but make purchase preconditions auditable and block unlinked or stale-SKU orders before purchase attempt |
| 8. Payment handling to supplier | Spocket syncs orders to AliExpress but still requires `Pay Now`; DSers moves orders to `Awaiting payment` after order placement; Zendrop auto-charges the payment method on file | Our code can place supplier orders but does not prove supplier-side payment completion | Missing first-class proof | Add an explicit supplier-payment state and hard proof requirement instead of treating order placement as full completion |
| 9. Realized profit tracking | Zendrop dashboard defines gross profit from gross revenue minus COGS and refunds; AutoDS exposes expected profit but still treats fees and monitoring separately | Our real-profit engine is stricter than average because it excludes demo and invalid rows | Stronger in truth, weaker in live proof | Preserve our engine and extend ops reporting to show why rows are excluded from finalized profit |
| 10. Daily optimizer / automatic cycle logic | Zendrop offers immediate and daily fulfillment modes; AutoDS runs multiple monitoring scans daily; competitors prefer store-level recurring jobs with issue queues | Our scheduler base exists, but the cycle is not commercially closed | Partial | Convert the daily cycle into a business-aware sequence: discovery -> strict validation -> small publish batch -> paid-order processing -> proof audit |

## High-Value Competitor Lessons

1. Strong platforms do not rely on raw product ingestion alone; they persist a mapping between sell-side variant and supplier-side variant.
2. Strong platforms do not leave destination and shipping assumptions implicit; they model them per country or per warehouse.
3. Strong platforms explicitly separate `order synced` from `order paid to supplier`.
4. Strong platforms pause listings automatically when stock or delivery promises drift outside policy.
5. Strong platforms expose issue queues instead of pretending automation succeeded.

## What We Should Preserve Instead Of Copying

We should not copy competitor looseness around proof. Our exclusion of fake commercial wins is better than average and must stay.

## Verified External References

- AutoDS price and stock monitoring: https://www.autods.com/features/price-stock-monitoring/
- AutoDS product monitoring preferences: https://help.autods.com/settings-page/product-monitoring-how-to-configure-your-preferences
- AutoDS sourcing service: https://help.autods.com/special-features/autods-product-sourcing-service
- DSers variant mapping: https://www.dsers.com/features/variants-mapping/
- DSers advanced destination mapping: https://help.dsers.com/set-up-local-based-suppliers-for-each-variant/
- DSers bulk order and awaiting payment flow: https://help.dsers.com/place-an-order-orders-in-bulk/
- Zendrop automated fulfillment: https://support.zendrop.com/en/articles/8176499-how-do-i-use-automated-fulfillment
- Zendrop dashboard profit model: https://support.zendrop.com/en/articles/12821991-the-dashboard-overview
- Spocket AliExpress payment flow: https://help.spocket.co/en/articles/8184726-how-do-i-process-aliexpress-dropshipping-orders-on-spocket
