# Opportunities search — final verdict

## Verdict

**OPPORTUNITIES_SEARCH_FIXED_AND_BROWSABLE** for the main `/opportunities` flow, within **AliExpress Affiliate** limits (up to **20 results per request**, multiple **pages** for the same query).

## What changed

- Removed the **hard `maxItems` cap of 10** in `findOpportunities`.
- Plumbed **`pageNo`** from the HTTP API into Affiliate `searchProducts`.
- Extended **`GET /api/opportunities`** with **`page`**, **`pagination`** metadata, and **cache key** including page.
- Updated **Opportunities** UI: page size 10/20, **Anterior/Siguiente**, clearer copy.

## Remaining limits (by design / provider)

- Cannot exceed **20 items per HTTP request** from Affiliate (single page size).
- **Total depth** is bounded by **`page` ≤ 500** on the API to limit abuse.
- **`mayHaveMore`** is heuristic, not a guaranteed total result count.

## Optional follow-ups

- Align **AIOpportunityFinder** / other dashboards with `page` + higher page size if those surfaces should match `/opportunities`.
- If a future provider returns **total count**, set `mayHaveMore` from that field.
