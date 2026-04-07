# P63 — Root-cause resolution path

## Symptom triad

1. **User-observed:** Public URL “looks like an ML error / unstable” in the browser (subjective; not re-captured in this automation).
2. **Prior sprint tooling:** `permalinkHeadStatus: 403` while API said `active` (P62) — **misleading** if interpreted as listing health.
3. **This sprint (pre-recovery API):** Listing had **regressed** to **`under_review` / `waiting_for_patch`** again (oscillation), with local `marketplace_listings.status` = `failed_publish`.

## Root cause A — API moderation loop (confirmed)

**Evidence:** Authenticated `getItem` at `2026-03-24T22:42:50.614Z` showed `waiting_for_patch` with the **same** approved pack picture IDs as after the prior P62 repair.

**Mechanism:** MercadoLibre re-entered **image patch / review** state; this is **not** explained by local-only drift (the API field is authoritative).

**Resolution path:** Listing-scoped **`p49-reactivate-ml-listing.ts`** (re-upload approved `cover_main` + `detail_mount_interface`, replace pictures, sync local rows).

## Root cause B — “Public error” via automation (confirmed for non-browser clients)

**Evidence:** `GET` the permalink returns **~2.4KB** HTML containing **`verifyChallenge`**, spinner, and “requires JavaScript” noscript — i.e. an **anti-automation challenge**, not product markup.

**Implication:** Simple `fetch`/curl **cannot** observe the buyer-rendered PDP. A **403** on `HEAD` is consistent with edge/WAF behavior and **must not** be treated as “item inactive.”

**Resolution path:** None inside repo-only HTTP without either:

- a **real browser** (manual), or  
- **headed automation** (Playwright/Puppeteer) that executes JS and passes cookies — **out of scope** for this sprint’s minimum commands.

## Deprioritized hypotheses (no evidence this run)

- **Category/content side effect:** No new category mutation performed; no ML API fields in our snapshot indicated a category block.
- **Visibility restriction:** Not visible in `MLItemSnapshot`; would need expanded ML fields if suspicion returns.

## Summary

| Layer | Primary cause | Action |
|--------|----------------|--------|
| API | `waiting_for_patch` again | **p49** picture replace |
| Public HTTP | Bot challenge shell for automation | Document; **manual browser** proof |
| HEAD 403 | WAF / method | Ignore for sellability; use API + browser |
