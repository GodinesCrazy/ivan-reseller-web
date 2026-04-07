# First Real-Profit Path Design

Date: 2026-03-21
Goal: Narrowest, safest, auditable route to the first real profitable operation

## Lead Choices

- Lead marketplace: eBay
- Lead supplier strategy: AliExpress first, but with destination-scoped variant mapping and explicit ship-to / ship-from truth
- Controlled backup supplier strategy: add a second supplier family only if the first targeted destination-first pilot still yields zero strict-ready candidates after a bounded recovery cycle

## Candidate Profile

- category style: light, non-branded, low-breakage, low-return-risk accessories or home utility items
- price band: roughly USD 22-60 retail
- variant complexity: low
- destination focus: one destination at a time, starting with the marketplace region where shipping truth is easiest to verify

## Validation Model

Required before listing:

- supplier URL resolves to real item
- destination country is explicit
- variant / SKU is explicit
- stock is available for that destination
- shipping method is available for that destination
- shipping cost is persisted
- import tax and total landed cost are persisted
- minimum margin survives fees

## Fee Model

Use strict fee completeness:

- supplier cost
- international shipping
- import tax if applicable
- marketplace fee
- payment fee
- optional buffer for refunds / delivery variance

No publish without fee completeness.

## Publish Gating Model

- only `VALIDATED_READY`
- no legacy `publishable`
- no missing target country
- no missing shipping cost
- no missing import tax
- no missing total cost
- no missing AliExpress SKU

## Order Ingestion Truth Model

- accept only paid marketplace orders into automatic supplier purchase
- explicitly separate:
  - order captured
  - supplier order placed
  - supplier payment completed
  - supplier shipped
  - marketplace delivered
  - marketplace funds released

## Supplier Purchase Execution Path

Preferred path:

- order enters `PAID`
- fulfillment service resolves product URL and SKU
- dropshipping API path is used first
- purchase log is persisted
- stale SKU or invalid URL blocks the flow instead of guessing

## Supplier Payment Path

Current near-term design:

- treat supplier payment as a distinct proof step
- do not call the operation successful at supplier order creation alone
- persist whether payment completed, remained pending, or required operator action

## Post-Sale Truth Model

- tracking numbers must be persisted and reconciled
- cancellations remain excluded from commercial proof
- delivery status alone does not count as profit proof unless payout release is also real

## Realized-Profit Recognition Point

Recognize realized profit only after:

1. supplier cost is known
2. supplier payment completed
3. shipment truth exists
4. marketplace payout is released
5. no cancellation or invalidation flags apply

## Why This Is The Narrowest Safe Path

- it preserves our strongest current architecture
- it avoids premature supplier sprawl
- it mirrors the strongest competitor pattern: map tightly, validate tightly, auto-fulfill only when the prerequisites are explicit
