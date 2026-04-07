# P27 Console Evidence Consolidation

## Source of truth
This document consolidates the latest AliExpress console findings supplied by the operator in the P27 brief on 2026-03-22.
These items are treated as externally verified console evidence, not codebase-derived inference.

## Console evidence
- App family: `Drop Shipping`
- App key: `522578`
- App status: `Online`
- Auth Management: `OAuth2.0 server-side enabled`
- Apply / process state: `DropShipping application process completed`
- Console error statistics explicitly include method:
  - `aliexpress.logistics.buyer.freight.calculate`
- Console-side error shown for that method:
  - `IncompleteSignature`

## P27 implication
- The old blocker hypothesis `freight method absent / not entitled` is no longer valid.
- The active hypothesis must be `method present, but request construction / secret / binding / path consistency is wrong somewhere in the live request path`.
- The canonical freight route remains:
  - `dropshipping app + dropshipping_session`

## Local code-side reconciliation on 2026-03-22
- The local freight rerun in this sprint reproduced real quotes through the dropshipping app family on `https://api-sg.aliexpress.com/sync`.
- The console-side `IncompleteSignature` was not reproduced in the fresh local rerun.
- The remaining code-side inconsistencies are narrower:
  - stale or mismatched env secret vs DB secret
  - affiliate-app misuse with dropshipping session
  - legacy TOP router variants that still fail while the sync path succeeds
