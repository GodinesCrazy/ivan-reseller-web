## P53 - SystemStatus Truth Refactor

### Scope

- updated `frontend/src/pages/SystemStatus.tsx`

### What changed

1. `SystemStatus` now separates connector health from operational truth.
2. Connector booleans remain, but only as infrastructure status.
3. Canonical operational truth is now visible on the same page.
4. The page explicitly warns that connected services do not imply commercial readiness.

### Exact canonical truth now visible

- canonical listing truth summary
- current blockers
- post-sale proof ladder
- agent decision trace
- operations evidence timestamp

### Exact technical truth still visible

- PayPal connection
- eBay connection
- Mercado Libre connection
- Amazon connection
- AliExpress OAuth
- Autopilot enabled
- Profit Guard enabled

### Result

`SystemStatus` no longer collapses live marketplace truth, blocker truth, and proof truth into simplistic green/red integration badges.
