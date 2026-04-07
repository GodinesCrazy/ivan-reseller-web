# P27 Secret And Binding Consistency

## Inputs reviewed
- `backend/src/services/credentials-manager.service.ts`
- `backend/src/services/pre-publish-validator.service.ts`
- `backend/scripts/check-aliexpress-top-credential-shapes.ts`
- live output: `backend/p27-credential-shapes-output.txt`
- live output: `backend/p27-freight-output-rerun.txt`

## Dropshipping credential truth on 2026-03-22
- Dropshipping app key in active DB credential:
  - `522578...`
- Dropshipping secret fingerprint loaded from active DB credential:
  - `503cee3e4a68`
- Dropshipping env app key prefix:
  - `522578...`
- Dropshipping env secret fingerprint:
  - `45ef233f777a`
- Result:
  - app key matches
  - secret fingerprint does not match

## Classification
- `secret_consistent`:
  - no
- `secret_suspect`:
  - yes
- Reason:
  - the active DB-loaded dropshipping secret and the current env dropshipping secret are different

## Session binding truth
- The successful freight rerun used:
  - app family `dropshipping`
  - token family `dropshipping_session`
  - credential source `credentials_manager:aliexpress-dropshipping`
  - token source `credentials_manager:aliexpress-dropshipping:accessToken`
- The affiliate-app-plus-dropshipping-session forensic strategy failed with:
  - `IllegalAccessToken`
  - `Invalid app Key`

## Classification
- `session_binding_consistent`:
  - yes, for the working `dropshipping_native` path
- `session_binding_suspect`:
  - yes, for any `affiliate + dropshipping_session` combination

## Code fix applied in P27
- `loadDropshippingCredentials()` in `backend/src/services/pre-publish-validator.service.ts` no longer prefers affiliate credentials.
- The env fallback for that helper is now strict to `ALIEXPRESS_DROPSHIPPING_*` instead of mixing affiliate or generic AliExpress vars.

## Conclusion
- The live working freight secret is the DB-loaded dropshipping secret, not the env secret.
- The canonical session binding is valid only when the dropshipping app is paired with the dropshipping session.
- Remaining secret risk is real:
  - any future code path that falls back to the env secret can still regress into signature failure or app/session mismatch.
