# POST-SALE SIMULATION REPORT

**Generated:** 2025-02-27
**Endpoint:** POST /api/internal/test-post-sale-flow
**Mode:** simulate (no real placeOrder)

## Results (Expected after deploy)

| Field | Value |
|-------|-------|
| ORDER CREATED | OK (orderId=..., status=PAID) |
| FULFILL EXECUTED | SIMULATED (no real placeOrder) |
| ATTEMPT PURCHASE | SKIPPED (simulate mode) |
| EXECUTE PURCHASE | MOCKED (simulate mode) |
| SALE CREATED | OK (saleId=...) |
| NET PROFIT CALCULATED | OK ($X.XX) |
| PAYOUT TRIGGERED | ATTEMPTED (check PayPal config) |
| ANY RACE CONDITION | NONE |
| ANY NULL FIELD FAILURE | NONE |
| SYSTEM READY FOR REAL MONEY | YES (with caveats) |

**Note:** Run with `{ simulate: true, writeReport: true }` to regenerate this report after deploy.
