# Opportunities — runtime fix final verdict

## Verdict (repository)

**PRODUCTION_OPPORTUNITIES_BROWSING_FIXED** after **both** API and web commits that include this runtime pass are **deployed** and the live checks in `OPPORTUNITIES_PRODUCTION_ALIGNMENT_PROOF.md` pass.

If only one side is deployed, the verdict is **FIX_EXISTS_BUT_NOT_DEPLOYED** until the other surface catches up.

## Why the earlier fix could look ineffective in production

- **Split deploy**: Vercel updated but Railway still on an older API (or the reverse).
- **~10 rows per Affiliate response**: a single provider call still looked like a “cap” until **multi-page merge** was added.
- **Cache**: repeating Search without `refresh` could re-hit Redis; mitigated with **`refresh=1`** on Search and **`no-store`** headers.

## Environment

- **`OPPORTUNITY_AFFILIATE_PROVIDER_PAGES_PER_UI`**: `1`–`3`, default `2`. Increase only if latency and rate limits allow.
