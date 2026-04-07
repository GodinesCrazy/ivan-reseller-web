# P22 Code-Side Recovery Exhaustion

## Objective
Separate what is still realistically fixable in code from what is blocked outside the codebase.

## Code-Side Recovery Matrix

| Recovery area | Status | Why |
| --- | --- | --- |
| Credential selection | Exhausted | Native dropshipping was tested directly; affiliate and cross-family alternatives were also tested |
| Token refresh / token presence | Disproven as root cause | Dropshipping access and refresh tokens already exist |
| App/session linkage | Blocked by external platform config | Cross-family pairing is invalid, native pairing still rejected |
| Method routing / domain | Exhausted | Endpoint is reached live, so transport is not the blocker |
| Request payload shape | Exhausted enough for this sprint | The method responds with app-key rejection, not a payload-validation error |
| Request signing | Exhausted enough for this sprint | Earlier signature problems were already moved aside; live error is now entitlement-shaped |
| Fallback to product endpoint shipping fields | Disproven | Product endpoint acknowledges destination but does not provide freight truth |

## Definitive Separation
### Still plausibly code-side
- none with high confidence under the current credential set

### Externally blocked
- freight method entitlement for the current app family
- app product-family permission in AliExpress/Open Platform
- possible need for a differently provisioned freight-capable app

## Conclusion
P22 treats code-side freight recovery as operationally exhausted for the current credentials.
The next meaningful move is external platform repair, not more blind internal rewiring.
