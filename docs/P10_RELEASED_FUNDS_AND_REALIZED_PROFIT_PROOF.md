# P10 Released Funds And Realized Profit Proof

Date: 2026-03-21

## Required Profit Layers For The Controlled ML Chile Operation

Projected margin:

- the publish-time estimate after supplier cost, shipping, taxes, and ML Chile fees

Order-time expected profit:

- the estimate once the real ML order exists and exact sale price is known

Supplier-purchase-adjusted profit:

- the estimate after actual supplier order and actual supplier cost are known

Released-funds-confirmed profit:

- the estimate after MercadoLibre actually releases funds

Realized net profit:

- the final recognized profit after all exclusion rules, supplier settlement truth, and released-funds proof

## When Profit Should Be Recognized

Only after:

1. the order remains commercially valid
2. supplier cost is real
3. supplier payment completed
4. shipment truth exists
5. MercadoLibre released the funds

## Current Missing Evidence

- no ML Chile sale exists in DB
- no ML Chile order exists in DB
- no ML Chile payout/released-funds proof exists
- no ML Chile realized-profit row exists

## Current Finish-Line Status

Realized-profit proof for ML Chile is absent.
This is a finish-line blocker.

## Controlled Success Rule

The first controlled operation will count as commercially successful only if:

- the buyer is real
- the order is real
- the supplier purchase is real
- the supplier payment is real
- released funds are real
- the profit engine can recognize the outcome as final

If any of those fail, the operation may still be useful, but it does not count as the first real profitable operation.
