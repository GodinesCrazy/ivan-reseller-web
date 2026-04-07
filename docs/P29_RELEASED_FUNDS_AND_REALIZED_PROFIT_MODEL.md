# P29 Released Funds And Realized Profit Model

Date: 2026-03-22

## Stage Model

### 1. Listing Created

Required evidence:

- real MercadoLibre `listingId`
- real listing permalink
- listing visible in seller account

Does not count as final business success.

### 2. Order Paid

Required evidence:

- real MercadoLibre order id
- internal `order` row linked as `mercadolibre:{mlOrderId}`
- paid amount recorded

Does not count as final business success.

### 3. Supplier Purchased

Required evidence:

- internal order reaches `PURCHASED`
- `aliexpressOrderId` exists
- supplier order id is non-test/non-simulated
- supplier item is a real AliExpress product

This is the first real supplier-purchase proof stage.

Still does not count as final business success.

### 4. Shipped

Required evidence:

- tracking number captured internally
- if needed, tracking submitted back to MercadoLibre

Does not count as final business success.

### 5. Delivered

Required evidence:

- delivered/completed marketplace truth
- internal sale/order lifecycle reflects post-delivery completion

Still not enough by itself for realized-profit proof.

### 6. Released Funds

Required evidence:

- production sale in a commercially valid completed state
- payout path is executed successfully
- `payoutExecuted = true`

This is the first released-funds proof stage.

### 7. Realized Profit

Required evidence:

- released-funds proof already exists
- sale is production, not simulated
- `netProfit > 0`
- payout execution succeeded

Only here may the software claim real-profit proof.

## What Does Not Count

- listing creation only
- buyer payment only
- supplier purchase only
- shipment only
- delivered order without payout execution
- any simulated, test, demo, or mock supplier order id

## Exact Runtime Criteria Reflected In Code

`scripts/check-first-real-profit-readiness.ts` currently treats the following as blockers:

- no real `PURCHASED` order proving supplier purchase
- no commercially valid production sale with payout executed
- no production sale qualifying for realized-profit proof

`sale.service.ts` reinforces the same standard:

- supplier purchase must be commercially eligible before `createSaleFromOrder`
- payout may fail or be skipped if config/balance is missing
- realized business proof requires completed production sale plus executed payout

## Practical Claim Boundary

The system may claim:

- `publish ready` after strict candidate and publish gates pass
- `sale observed` after a real MercadoLibre order exists
- `supplier proof obtained` after real `PURCHASED`
- `released-funds proof obtained` only after payout execution
- `realized-profit proof obtained` only after released funds plus positive real net profit
