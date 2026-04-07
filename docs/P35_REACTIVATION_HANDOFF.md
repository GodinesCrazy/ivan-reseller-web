# P35 Reactivation Handoff

Date: 2026-03-23

## Listing target

- `listingId = MLC3786354420`

## Exact replacement order

1. remove current non-compliant cover
2. upload `cover_main` first
3. upload clean gallery:
   - `detail_mount_interface`
   - `usage_context_clean` if approved and used
4. save changes
5. reactivate or resubmit if MercadoLibre requires it

## Evidence to capture after replacement

1. screenshot of the uploaded new `cover_main`
2. screenshot of the final gallery order
3. screenshot of publication status after save
4. screenshot of any MercadoLibre review or approval message
5. copy of the final approved cover URL

## Exact local follow-up after replacement

1. store the final approved cover URL
2. write the reviewed-proof payload as `ml_image_policy_pass`
3. preserve before/after visual evidence for audit

## Stop rule

Do not resume sale progression if:

- the new cover is not approved against the P35 checklist
- MercadoLibre still flags or pauses the publication
- the final approved cover URL cannot be confirmed

