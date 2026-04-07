# P2 eBay Connector Readiness

## Objective

Unblock local eBay connector readiness enough to make a first real validation path possible.

## What Was Fixed

The eBay OAuth start URL builder previously preferred stored/explicit production redirect URLs even when the request originated locally.

That meant local OAuth initiation could silently route users back to the production callback.

Implemented fix:

- when the request base is local (`localhost` / `127.0.0.1`), the builder now prefers the local backend callback URL

## Real Proof

Direct runtime execution from source produced an eBay authorize URL with:

- `redirect_uri=http://localhost:4000/api/marketplace-oauth/oauth/callback/ebay`

This proves the callback precedence bug is fixed.

## Remaining Real Blocker

Real credential diagnostics still fail:

- `npx tsx scripts/check-ebay-oauth.ts`
- result:
  - `eBay ... error al descifrar/parsear`

That means the connector is still not usable locally for real validation until the stored credential state is repaired or re-authorized.

## P2 Verdict

`PARTIAL`

Code-side local callback handling is fixed, but real local OAuth completion is still blocked by credential integrity.

