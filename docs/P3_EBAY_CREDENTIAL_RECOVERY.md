# P3 eBay Credential Recovery

## Objective

Repair the local eBay credential path without weakening encryption or bypassing secure storage.

## What Was Found

Real diagnostics showed two distinct states:

- Active `userId=1` production credentials were actually valid and readable with the current `ENCRYPTION_KEY`.
- Legacy `userId=41` rows were malformed plaintext payloads and correctly classified as `parse_failed`.

This means the earlier local conclusion of “eBay OAuth missing” was not a true connector failure for the active operating user. It was a diagnostic-path failure mixed with stale rows.

## Implemented Changes

- Added integrity classification in the credential path:
  - `missing`
  - `valid`
  - `undecryptable`
  - `parse_failed`
  - `expired`
- Updated marketplace credential resolution to surface integrity state and reason codes instead of collapsing everything into “missing token”.
- Replaced the stale `check-ebay-oauth.ts` diagnostic behavior with the real credential path.

## Real Evidence

`npx tsx scripts/check-ebay-oauth.ts`

Returned:

- `userId=1 / production / scope=user => integrity=valid reason=valid token=SI refresh=SI usable=SI`
- `userId=41` legacy rows => `parse_failed`

## Result

- Active eBay credential integrity is repaired for the real operating user.
- Broken legacy eBay rows remain isolated and truthfully classified.
- No security weakening was introduced.
