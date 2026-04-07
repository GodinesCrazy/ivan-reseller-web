# P96 — Image blocker check (product 32714)

## Status: DONE (isolated)

### After pricing uplift + persistence

Preflight and preventive preparation still hit **Mercado Libre image fail-closed** behavior for product **32714**.

### Exact next image blocker (single headline)

**`ml_canonical_dual_gate_failed_all_candidates_and_remediations`**

### Supporting remediation detail (from runtime logs / preflight)

- **Policy:** `ml_image_policy_fail` — example hard blocker: `primary_image_not_square_like`
- **Remediation pipeline:** `canonical_pipeline_v1` → `publishSafe: false`, `decision: manual_review_required`
- **Collapsed reasons (representative set):**
  - `remediation_simulation_all_weak_preview`
  - `last_try:square_white_catalog_jpeg:policy=false:conv=false:hero=true:integrity=true`
  - `missing_required_assets:cover_main,detail_mount_interface`
  - `unapproved_required_assets:cover_main,detail_mount_interface`

### Scope note

No redesign of the global image system was performed. The blocker is **specifically** the dual-gate + required asset pack approval path for this product’s current supplier images.
