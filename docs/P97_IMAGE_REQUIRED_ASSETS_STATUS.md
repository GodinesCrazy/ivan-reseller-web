# P97 — Required ML image assets for product 32714

## Status: DONE (check only; gates unchanged)

### Canonical requirements

From `mercadolibre-image-remediation.service.ts`, required pack slots for MLC publish:

- `cover_main` (required)
- `detail_mount_interface` (required)
- `usage_context_clean` (optional)

### Exact status from preflight (same path as publish)

Source: `resolveMercadoLibrePublishImageInputs` → `runMercadoLibreImageRemediationPipeline`, surfaced on `buildMercadoLibrePublishPreflight` as `images.requiredAssets`.

**Post-P97 `p95-preflight.json` excerpt:**

| Asset | `approvalState` | `exists` | `localPath` | Notes |
|--------|-----------------|----------|-------------|--------|
| `cover_main` | **missing** | `false` | `null` | Not generated/committed to approved pack on disk for this product |
| `detail_mount_interface` | **missing** | `false` | `null` | Same |

**Pack-level:** `images.packApproved`: **false**  
**Publish:** `images.publishSafe`: **false**

### Policy context (not separate “asset rows” but same failure)

Runtime logs / remediation blocking reasons include:

- `primary_image_not_square_like` (policy audit)
- `ml_canonical_dual_gate_failed_all_candidates_and_remediations`
- `last_try:square_white_catalog_jpeg:policy=false:conv=false:hero=true:integrity=true`
- Aggregated strings: `missing_required_assets:cover_main,detail_mount_interface`, `unapproved_required_assets:cover_main,detail_mount_interface`

### Interpretation

- **Neither** required asset is in an **approved, policy-passing** state; both are effectively **absent** from the compliant pack.
- **Image unblock attempt:** No fail-closed bypass was added. Automated canonical pipeline did not produce `publishSafe: true`; outcome is **manual_review_required** / dual-gate failure until compliant files exist and pass gates (or operator workflow approves per existing policy, without code changes here).
