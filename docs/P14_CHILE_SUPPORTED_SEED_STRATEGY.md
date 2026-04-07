# P14 Chile-Supported Seed Strategy

## Objective

Replace the generic low-risk discovery seed set with a supplier-first Chile-supported seed strategy that can feed the strict ML Chile funnel.

## Implemented Strategy

The new seed strategy now starts from AliExpress Affiliate search results scoped to Chile:

1. select a narrow safe query set
2. run Affiliate search with `shipToCountry = CL`
3. filter titles for low-risk and query alignment
4. confirm each candidate with Dropshipping `getProductInfo(... localCountry = 'CL')`
5. apply the Chile-support discovery gate
6. apply the CL-SKU gate
7. only then try strict ML Chile funnel re-entry

## Active Seed Queries

- `cable organizer`
- `adhesive hook`
- `drawer organizer`
- `desk organizer`
- `kitchen organizer`
- `storage basket`
- `closet organizer`
- `under shelf storage`

## Safety Filters Added

- low-breakage and non-battery bias
- low-variant bias
- title-level banned-term filtering
- query-alignment filtering so the seed set does not drift into unrelated affiliate noise
- supplier-side Chile truth required before a candidate can proceed

## Commercial Constraint Preserved

The strategy does not weaken strict validation:

- no candidate is admitted without Chile support
- no candidate is admitted without supplier-side proof
- no publish/post-sale steps are attempted without a strict ML Chile candidate

## P14 Verdict

`CHILE-SUPPORTED SEED STRATEGY = DONE`
