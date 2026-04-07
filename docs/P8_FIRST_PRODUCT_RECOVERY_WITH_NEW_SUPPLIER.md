# P8 First Product Recovery With New Supplier

## Strategy executed

P8 ran the first-product recovery wrapper using the selected new supplier target:

- strategy: `alibaba_minimal`

## Real result

- `executed=false`
- `productionSafe=false`
- `scanned=0`
- `rejected=0`
- `nearValid=0`
- `validated=0`
- `rejectionSummaryByCode.supplier_data_incomplete=1`

## Blocking reasons

- no active Alibaba credentials
- no SKU stock truth
- no destination shipping truth
- no shipping-cost truth
- no order-placement truth

## Comparison vs prior AliExpress-first evidence

Prior AliExpress-first evidence:

- `90 scanned`
- `90 rejected`
- `0 validated`

P8 new-supplier result:

- new supplier path could not even enter the strict candidate loop safely

## Conclusion

P8 did not improve candidate quality materially, because the new supplier target is still blocked before strict validation can begin.
