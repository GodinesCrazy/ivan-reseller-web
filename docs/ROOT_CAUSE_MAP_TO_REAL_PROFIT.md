# Root Cause Map To Real Profit

Date: 2026-03-21

## A. Supplier-Side Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| Destination-valid stock truth fails too often | repeated rejection reasons include `no_stock_for_destination` and `supplier_unavailable` | Critical | discovery -> validation -> publish | First operation |
| Shipping and landed-cost truth are mostly missing | almost all products lack `targetCountry`, `shippingCost`, `importTax`, and `totalCost` | Critical | validation -> pricing -> publish | First operation |
| Variant / SKU persistence is near-zero | almost all catalog rows lack `aliexpressSku` | Critical | validation -> purchase -> repeatability | First operation |

## B. Marketplace-Side Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| eBay production token refresh failing | live runtime showed repeated HTTP `400` refresh failures | Critical | publish -> order sync -> post-sale | First operation |
| eBay live webhook readiness degraded | readiness script reported endpoint/token/config blockers | High | order ingestion -> truth -> post-sale | First operation |
| MercadoLibre auth unhealthy | live runtime showed `401 invalid access token` | Medium | fallback marketplace only | Repeatability unless eBay fails completely |

## C. Pricing / Fee-Side Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| margin invalid remains common | dominant rejection reasons include `margin_invalid` | Critical | validation -> publish | First operation |
| fee logic outruns data completeness | strong engine exists, but live inputs are missing | High | validation -> pricing -> realized profit | First operation |

## D. Purchase / Payment-Side Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| supplier-side payment completion is not proven | no valid order proves AliExpress checkout plus final payment | Critical | purchase -> shipment -> profit | First operation |
| current PURCHASED evidence is synthetic | recent purchased orders are testlike or synthetic | Critical | purchase -> profit proof | First operation |

## E. Post-Sale Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| tracking truth not yet operationally strong | tracking sync processed rows but updated none and returned errors | High | shipment -> delivery -> payout timing | First operation |
| valid inbound event proof still missing | no safe listing has produced a commercially valid inbound order flow | High | order ingestion -> truth -> repeatability | First operation |

## F. Realized-Profit Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| released funds are not proven on a valid order | production includes `PAYOUT_FAILED` and weak `DELIVERED` evidence | Critical | payout -> realized profit | First operation |
| real-profit engine has no qualifying production rows | current finalized production profit is zero | Critical | full loop | First operation |

## G. Automation / Orchestrator Blockers

| Blocker | Evidence | Severity | Dependency chain | First operation or repeatability |
| --- | --- | --- | --- | --- |
| optimizer is not yet commercially learning | discovery runs but stores `0` winners | High | discovery -> validation | Repeatability and first operation yield |
| stale publish surfaces created false readiness | publisher was still scanning `publishable` rows until this transformation step | High | publish safety | First operation |

## Root-Cause Conclusion

The first profitable operation is blocked most directly by:

1. zero strict validated-ready output
2. degraded eBay operational health
3. unproven supplier-side payment completion
4. absent released-funds profit proof
