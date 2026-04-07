# P59 — Waiting_for_patch Recovery

Date: 2026-03-24  
Sprint: P59 — Listing Stability Recovery

## Objective

Clear the renewed MercadoLibre `waiting_for_patch` state if still present.

## Possible Causes

| Cause | Description |
|-------|-------------|
| image-related recurrence | ML re-flagged images after P49 patch; same or new policy trigger |
| marketplace-side delayed review | ML review queue; patch applied but not yet processed |
| local/remote truth drift | Local DB says active; ML API says under_review |
| another ML policy signal | Category, title, or other attribute triggered review |

## Existing Recovery Path (P49)

The script `p49-reactivate-ml-listing.ts` already implements the recovery flow:

1. **Asset pack check:** Requires approved assets (cover_main, detail_mount_interface, usage_context_clean)
2. **Replace pictures:** `mlService.replaceListingPictures(listingId, paths)`
3. **Activate if needed:** If status ≠ active after replace, `mlService.activateListing(listingId)`
4. **Local sync:** Update marketplace_listing row and product status

**Command:**
```
npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420
```

## P59 Recovery Attempt

**Blocked:** Postgres connection exhaustion prevented running any script that requires DB (including p49, which needs product, listing, asset pack from DB).

## Safe Corrective Actions (when DB is available)

1. **Re-run P49 reactivation:**
   - Ensures asset pack is still approved
   - Replaces pictures with current approved assets
   - Activates listing
   - Low risk if assets are policy-compliant

2. **Manual ML seller center:**
   - Operator checks MercadoLibre seller account for the listing
   - If ML shows "waiting_for_patch" or similar, follow ML UI prompts to fix
   - May require re-uploading images or acknowledging policy

3. **Verify asset pack:**
   - Run `npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`
   - Ensure approvalState=approved for required assets

## Exact Required External/Manual Step (if script fails)

If `p49-reactivate-ml-listing.ts` fails or does not clear waiting_for_patch:

- Log into MercadoLibre Chile seller account
- Locate listing MLC3786354420
- Follow ML's on-screen instructions for the "waiting_for_patch" or under_review state
- Re-upload or replace images if ML requests
- Wait for ML to complete review (can take hours)

## P59 Status

**PARTIAL** — Recovery path documented and script exists; execution blocked by DB. No fabrication of recovery.
