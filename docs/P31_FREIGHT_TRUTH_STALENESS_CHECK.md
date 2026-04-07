# P31 Freight Truth Staleness Check

Date: 2026-03-22
Candidate: `32690`

## Persisted freight truth checked

```json
{
  "freightSummaryCode": "freight_quote_found_for_cl",
  "checkedAt": "2026-03-22T22:45:09.762Z",
  "targetCountry": "CL",
  "selectedServiceName": "CAINIAO_FULFILLMENT_STD",
  "selectedFreightAmount": 2.99,
  "selectedFreightCurrency": "USD"
}
```

Top-level product consistency:

```text
targetCountry=CL
shippingCost=2.99
importTax=0.80
totalCost=5.01
aliexpressSku=12000051835705515
```

## Freshness / consistency result

Retest runtime log showed:

```text
checkedAt=2026-03-22T22:45:09.762Z
ageHours=2.6274658333333334
shippingUsd=2.99
selectedServiceName=CAINIAO_FULFILLMENT_STD
```

Consistency checks:

- selected freight amount `2.99 USD` matched top-level `shippingCost=2.99`
- freight target country was `CL`
- product target country was `CL`
- canonical summary code was `freight_quote_found_for_cl`
- timestamp was fresh for controlled publication

## Classification

- `freight_truth_fresh`
- `freight_truth_ready_for_publish`

Not observed:

- `freight_truth_stale`
- `freight_truth_inconsistent`
