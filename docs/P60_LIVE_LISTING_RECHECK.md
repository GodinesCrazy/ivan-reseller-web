# P60 — Live Listing Recheck

Date: 2026-03-24  
Sprint: P60 — Runtime Recovery + Listing Stability

## Objective

Obtain a fresh live state for MLC3786354420 after DB recovery.

## P60 Attempt

**Prerequisite:** DB headroom must be restored before running the monitor.

**Command attempted:** `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420` (with PRISMA_CONNECTION_LIMIT=3)

**Result:** FAIL — DB connection exhaustion. No live API call was made.

## Fresh State Obtained

**None.** The p50 monitor requires DB for product, listing, credentials, and ML API calls. All blocked.

## Last Known State (P50)

| Field | Value |
|-------|-------|
| listing status | under_review |
| sub_status | ["waiting_for_patch"] |
| public permalink | HTTP 200 |
| local product | PUBLISHED, isPublished=true |
| local listing row | exists |

## Classification

**unknown_due_runtime_issue**

- Cannot classify with fresh data.
- Last known: under_review, waiting_for_patch, drifted (from P49 active).

## When DB Recovers

1. Run `npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420`
2. Capture `liveItem.status`, `liveItem.sub_status`, `permalinkHeadStatus`
3. Reclassify: active_and_sellable | under_review | waiting_for_patch | blocked | drifted
