# P95 — Preventive Preparation Rerun

## Product: 32714

## Execution

After mlChileFreight was persisted, `prepareProductForSafePublishing` was re-run.

### Economics Core Result

```json
{
  "ok": false,
  "message": "real profit -2.07 must be > 0 (sale 7.02 vs total cost 9.09)"
}
```

### Root Cause: Negative Profit

The `runPreventiveEconomicsCore` gate correctly identifies that the listing would lose money:

| Field | Value |
|---|---|
| Listing Sale Price | $7.02 USD |
| Supplier Cost (AE) | $3.19 USD |
| Shipping Cost | $3.12 USD |
| Import Tax (19% VAT CL) | $1.20 USD |
| ML Marketplace Fees | ~$1.58 USD (estimated) |
| **Total Cost** | **$9.09 USD** |
| **Net Profit** | **-$2.07 USD** |
| Gate Result | **BLOCKED — negative profit** |

### Why This Is Correct Behavior

The preventive preparation **correctly blocks** publishing because:

1. The suggested price ($7.02) is lower than the total cost ($9.09)
2. MercadoLibre Chile charges ~13% final value fee + payment processing fees
3. The product would be sold at a $2.07 loss per unit
4. The fail-closed gate (`real profit must be > 0`) is non-negotiable

### What Was Persisted

| Field | Persisted |
|---|---|
| shippingCost | ✅ $3.12 |
| importTax | ✅ $1.20 |
| totalCost | ✅ $7.51 (landed cost, without ML fees) |
| preventivePublish | ❌ Not persisted (economics failed) |
| product status | Changed to VALIDATED_READY by previous run |

### Required Action to Unblock

The listing price (`suggestedPrice` / `finalPrice`) needs to be at least $9.50-$10.00 USD to achieve minimum viable profit after all fees. Current $7.02 is insufficient. Options:
1. Increase the listing price to cover costs + min profit margin
2. Find a lower-cost shipping option
3. Find a cheaper supplier for this product
