## P51 - Screen-by-Screen Redesign Plan

### Dashboard

Current purpose:
- broad system summary

Truthfulness issues:
- local automation toggle
- mixed metrics from unrelated sources
- AI availability inferred from health
- potential conflation of revenue/profit truth

Redesign:
- convert into canonical Operations Dashboard
- remove local-only automation truth
- add live marketplace review states
- add exact active blockers
- add proof ladder for commercial stages

Show:
- real listing states
- last sync times
- blocker counts
- real orders count
- released-funds proof count

Remove or relabel:
- simulated automation state
- any vague success badges

### Products / Catalog

Current purpose:
- product inventory and readiness

Truthfulness issues:
- product status can overshadow listing reality
- profit label reads like real profit
- mixed product/listing/validation concepts in one row

Redesign:
- split product truth from marketplace listing truth
- show per-marketplace state chip
- show blocker chip and last evidence timestamp

Show:
- validation state
- publish safety
- image remediation state
- live listing state
- last order for this product

Relabel:
- `Profit` -> `Estimated unit margin`

### Product Preview

Current purpose:
- pre-publication preview and financial estimate

Truthfulness issues:
- financial labels are too strong for estimated values
- workflow view omits ML-specific stages

Redesign:
- make this explicitly a pre-publication planning screen
- show estimate confidence and missing proof
- embed marketplace-specific block/publish-readiness panel

### Intelligent Publisher

Current purpose:
- approve/publish pending products and inspect listings

Truthfulness issues:
- estimated economics shown next to operational actions without enough proof labeling
- listing rows lack exact live status/sub-status

Redesign:
- show publish contract, safety blockers, and marketplace result side-by-side
- show listing state as:
  - created
  - under_review
  - waiting_for_patch
  - active
  - blocked

### Orders

Current purpose:
- real post-sale operations

Truthfulness issues:
- still somewhat eBay-centric in language
- missing full proof ladder context

Redesign:
- keep as primary truthful post-sale screen
- add marketplace-neutral language
- add supplier purchase proof, tracking proof, payout proof columns
- add exact blocker reason and agent decision trace

### Sales

Current purpose:
- business results and sales rows

Truthfulness issues:
- simulated conversion rate
- profit truth not separated by proof stage

Redesign:
- split into:
  - recorded sales activity
  - payout proof
  - realized profit proof
- remove simulated analytics

### Control Center

Current purpose:
- unified strategic dashboard

Truthfulness issues:
- readiness and autonomy language too broad
- utilities and optimization language may imply commercial success

Redesign:
- convert into an operations command center backed by canonical lifecycle truth
- keep readiness, but separate:
  - infrastructure readiness
  - marketplace readiness
  - commercial proof readiness

### Autopilot

Current purpose:
- workflow, scheduler, config, runtime status

Truthfulness issues:
- good technical surface, weak business traceability

Redesign:
- keep as technical automation console
- add agent outputs, advisory vs enforced distinction, and last blocking decision per workflow

### System Status

Current purpose:
- connector and service status

Truthfulness issues:
- reductive booleans
- connection can be misread as full readiness

Redesign:
- make this strictly infrastructure/connectors only
- add disclaimer: "connected != commercially ready"
