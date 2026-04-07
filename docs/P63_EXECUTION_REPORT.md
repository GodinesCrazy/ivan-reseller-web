# P63 — Execution report

**Objective:** Restore controlled listing **MLC3786354420** (product **32690**) toward **operationally trustworthy** state, reconciling **API truth** with **public-facing** signals without fabricating stability.

## Commands executed

| Command | Result |
|---------|--------|
| `npm run type-check` | Exit **0** |
| `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` | Pre-recovery baseline |
| `npx tsx scripts/check-ml-asset-pack-readiness.ts 32690` | Pack ready |
| `npx tsx scripts/p49-reactivate-ml-listing.ts 32690 MLC3786354420` | **Success** — `active` / `[]` |
| `p50` (final) | Post-recovery verification |

## Engineering change

**File:** `backend/scripts/p50-monitor-ml-controlled-sale.ts`

- Added **`permalinkPublicProbe`**: browser-like `GET`, Spanish error hints, listing-id-in-body heuristics, **`challengeShellDetected`**, approximate body size.
- Rationale: **`HEAD` = 403** and **GET = 200** with **~2.4KB challenge HTML** explained false “public error” narratives for automation.

## Outcome vs primary objective

| Goal | Status |
|------|--------|
| A — Stable sellable **including** machine-verified public PDP | **Not fully met** — public HTML is **not** observable via simple fetch (ML challenge). |
| A — Stable sellable **API + ops** | **Met** — `active`, `sub_status: []`, local rows aligned. |
| B — Irreducible external step | **Partial** — **manual browser** (or JS-capable automation) to confirm buyer-visible page if business requires that proof. |

## Artifacts

- `docs/P63_DUAL_TRUTH_AUDIT.md`
- `docs/P63_ROOT_CAUSE_RESOLUTION_PATH.md`
- `docs/P63_TARGETED_LISTING_RECOVERY_EXECUTION.md`
- `docs/P63_STABILITY_VERIFICATION.md`
- `docs/P63_LOCAL_REMOTE_FINAL_ALIGNMENT.md`
- `docs/P63_COMMERCIAL_READY_HANDOFF.md`
- `docs/P63_EXECUTION_REPORT.md` (this file)
