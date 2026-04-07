# P28 First Strict VALIDATED_READY Attempt

## Goal

Push the best freight-enabled ML Chile candidate into strict `VALIDATED_READY` without weakening any gate.

## Prioritized Candidate

Used the P27-proven freight-enabled candidate first:

- product id: `32637`
- title: `New Quartz watch + Smart Ring Heart Rate Blood Oxygen Sleep Monitoring Time Display/Adjustment Waterproof Sports smartring Men`

## Candidate Proof

Direct row inspection after P28 auth recovery and reconciliation:

```json
{
  "id": 32637,
  "status": "VALIDATED_READY",
  "targetCountry": "CL",
  "shippingCost": "2.99",
  "importTax": "5.19",
  "totalCost": "32.52",
  "aliexpressSku": "12000052189745928",
  "finalPrice": "35.29"
}
```

## Outcome

The attempt succeeded.

- first strict `VALIDATED_READY` ML Chile candidate: achieved
- exact candidate proven: `32637`
- total strict-ready ML Chile candidates after rerun: `16`

## Next Exact Blockers After This Success

The lead blockers moved beyond auth and strict presale readiness:

- `no_ml_chile_released_funds_profit_proof`
- `no_real_mercadolibre_order_with_supplier_purchase_proof`

## Conclusion

P28 achieved outcome A:

- MercadoLibre Chile auth/runtime readiness recovered
- at least one candidate, and in fact `16`, reached strict `VALIDATED_READY`
