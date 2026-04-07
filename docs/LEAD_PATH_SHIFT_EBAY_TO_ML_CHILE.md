# Lead Path Shift - eBay To MercadoLibre Chile

Date: 2026-03-21

## Decision

eBay is no longer the first commercial validation path.
MercadoLibre Chile is now the lead path for the first controlled real-world operation.

## Why

- a real known buyer in Chile can coordinate the first purchase
- delivery and received-state truth can be observed more directly
- funds-release and payout truth can be checked in a tighter loop
- the goal is not maximum automation breadth; it is first truthful commercial validation

## What This Does Not Mean

- eBay is not abandoned
- ML Chile is not automatically healthier in runtime today
- safety thresholds are not weakened

## What This Means

- all first-operation planning now optimizes for ML Chile
- AliExpress remains the supplier path for this phase
- post-sale and released-funds proof are mandatory before calling the software commercially ready
