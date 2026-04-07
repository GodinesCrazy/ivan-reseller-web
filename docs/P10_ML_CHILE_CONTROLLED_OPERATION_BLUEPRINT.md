# P10 ML Chile Controlled Operation Blueprint

Date: 2026-03-21

## Narrowest Safe Blueprint

- exact marketplace path: MercadoLibre Chile (`MLC`)
- exact destination country: `CL`
- exact currency: `CLP`
- exact language context: Spanish for Chile

## Fee Model Required

- ML commission percentage
- ML fixed cost tier in `CLP`
- shipping subsidy or seller-paid shipping component if applicable
- AliExpress supplier cost
- import tax in current model
- supplier-side payment cost if materially separate

## Product Style For First Controlled Operation

- generic home or desk utility
- light and compact
- low-breakage
- low-return-risk
- low-variant complexity
- non-branded

## Target Price Band

- CLP `24,990` to `39,990`

This is narrow enough to avoid the lowest-value fixed-fee squeeze while staying realistic for a controlled buyer test.

## Shipping Constraints

- tracked AliExpress shipping to Chile
- no fragile glass
- no batteries
- no oversized packages
- no apparel sizing complexity

## Buyer Coordination Assumptions

- buyer is known and cooperative
- buyer uses a real Chilean delivery address
- buyer will not cancel casually
- buyer will confirm delivery and any post-sale issue honestly

## Supplier Purchase Assumptions

- AliExpress remains the supplier path
- purchase should use the strict mapped item and SKU
- max-price guard remains active
- if supplier payment cannot complete safely, the operation does not count as success

## Post-Sale Observability Requirements

- ML order ID captured
- supplier order ID captured
- tracking ID captured
- delivery confirmation captured
- payout release captured

## Realized-Profit Proof Requirement

The operation is only commercially successful if the real-profit engine can eventually recognize the order as finalized after released-funds proof.
