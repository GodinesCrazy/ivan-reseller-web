# Marketplace vs Supplier Reality Audit

Date: 2026-03-21
Scope: eBay, MercadoLibre, and Amazon evaluated against the real AliExpress-only bottleneck

## Core Conclusion

eBay should remain the lead marketplace path, but not because it is healthy. It should remain the lead because the alternatives are weaker under current evidence.

MercadoLibre is not currently in better operational shape.
Amazon is too immature to matter for the first profitable AliExpress-only operation.

## Marketplace Scorecard

| Marketplace | Auth maturity | Publish readiness | Webhook maturity | Order-sync maturity | Post-sale relevance | Fit with AliExpress-only reality | Audit verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| eBay | Strong but currently degraded | Blocked | Historically real, currently degraded | Partial | Highest | Best current fit | Lead path, but operationally blocked |
| MercadoLibre | Broken to partial | Weak | Secondary | Broken in current runtime | Medium | Not clearly better than eBay | Not ready to replace eBay |
| Amazon | Broken to partial | Immature | Immature | Immature | Low for near-term plan | Weak | Ignore for first-profit path |

## eBay Audit

What is proven:

- eBay OAuth and marketplace integration are materially real in the codebase
- stored webhook proof indicates prior verification work reached roughly the `subscription-registered` level
- eBay remains the most relevant marketplace for the current architecture

What is only code-level or historically true:

- a safe publish path exists in architecture
- webhook event ingestion path exists
- order lifecycle handling exists

What is blocked today:

- live production token refresh is repeatedly failing with HTTP `400`
- current webhook readiness fails with blockers including missing or unreachable endpoint, verification token, notification config, topic reachability, and unusable notification token
- safe publish is impossible because no product is `VALIDATED_READY`

eBay conclusion:

eBay is still the best-positioned marketplace for the first profitable AliExpress-based operation, but the operational state is currently below that bar.

## MercadoLibre Audit

What is proven:

- MercadoLibre integration exists in the codebase

What is blocked today:

- live runtime logs show repeated order-sync failure with `401 invalid access token`
- there is no evidence that MercadoLibre currently improves the shipping, stock, or margin constraints that already block AliExpress-only validation

MercadoLibre conclusion:

MercadoLibre is not a healthier replacement path right now. It does not solve the supplier-truth bottleneck, and its own auth state is currently broken.

## Amazon Audit

What is proven:

- Amazon-related surface exists in the codebase

What is blocked today:

- no evidence that Amazon is near publish-ready, webhook-ready, or order-ready for the first profitable operation
- no evidence that Amazon has better fit than eBay for the current AliExpress-only reality

Amazon conclusion:

Amazon is too immature to matter in the near-term commercial roadmap.

## Supplier Reality vs Marketplace Reality

The main bottleneck is still upstream of marketplace choice:

- no validated-ready catalog output
- incomplete shipping and cost truth
- unproven supplier-side PayPal settlement

This means marketplace switching would not fix the core problem.

## Final Recommendations

1. Keep eBay as the lead path
2. Do not switch to MercadoLibre unless auth health and destination-fit evidence materially improves
3. Treat Amazon as irrelevant to the first real-profit milestone
4. Focus the next recovery cycle on supplier truth coverage, eBay credential health, and payment execution proof

## Final Classification

- eBay: `PARTIAL`
- MercadoLibre: `BROKEN`
- Amazon: `BROKEN`
- Overall marketplace maturity: `PARTIAL`
