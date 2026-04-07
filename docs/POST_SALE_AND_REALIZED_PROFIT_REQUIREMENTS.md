# Post-Sale And Realized-Profit Requirements

Date: 2026-03-21
Status: Persistent business rule

## Mandatory Rules

- order capture is not profit
- supplier order placement is not profit
- delivery state is not profit
- payout-failed operations are not profit
- cancelled or invalid orders are never success
- estimated margin is not realized profit

## Required Proof Chain

1. valid order
2. valid supplier purchase
3. supplier payment completion
4. shipment and tracking truth
5. marketplace delivery or equivalent completion truth
6. marketplace fund release
7. realized net profit recognition

## Transformation Rule

Any implementation that skips a step in this chain is incomplete.
