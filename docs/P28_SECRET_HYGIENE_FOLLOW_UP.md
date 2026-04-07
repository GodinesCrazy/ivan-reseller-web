# P28 Secret Hygiene Follow-Up

## Goal

Reduce regression risk from the already-proven AliExpress dropshipping secret mismatch without reopening freight investigation.

## Active Truth Carried Forward From P27

- canonical freight path remains working:
  - dropshipping app
  - dropshipping session
  - `https://api-sg.aliexpress.com/sync`
  - `access_token`
  - `md5`
- P27 proved the working secret source was the DB-backed dropshipping credential path
- P27 also proved an env-vs-DB secret mismatch still exists

## Hygiene Conclusion

P28 did not change the AliExpress freight implementation. That is intentional.

- no freight route changes were made
- no freight signature changes were made
- no secret-source fallback behavior was reopened here

This keeps the working canonical freight route stable while ML Chile auth and strict readiness were repaired.

## Remaining Hygiene Risk

The residual P27 mismatch still needs cleanup outside this sprint:

- working dropshipping secret source: DB-backed credentials-manager path
- stale mismatched source: dropshipping env secret

## Recommended Hygiene Action

Do one controlled cleanup move in a future follow-up:

- align or remove the stale dropshipping env secret so runtime cannot drift away from the DB-backed working secret

That is regression prevention only. It is not a freight re-investigation item anymore.
