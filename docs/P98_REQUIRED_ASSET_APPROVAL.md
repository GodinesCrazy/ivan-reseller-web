# P98 — Required asset approval (product 32714)

## Status: DONE

### Post-remediation state (preflight path)

Verified via `buildMercadoLibrePublishPreflight` → `resolveMercadoLibrePublishImageInputs` (same as `p95-preflight-check.ts`).

| Asset | `exists` | `localPath` | `approvalState` | `min1200` | `squareLike` |
|--------|----------|-------------|-----------------|-----------|--------------|
| `cover_main` | `true` | `.../artifacts/ml-image-packs/product-32714/cover_main.png` | **approved** | `true` | `true` |
| `detail_mount_interface` | `true` | `.../artifacts/ml-image-packs/product-32714/detail_mount_interface.png` | **approved** | `true` | `true` |

- **`images.packApproved`:** `true`
- **`images.publishSafe`:** `true`
- **`images.imageCount`:** `2` (publishable local paths from approved pack)

### Policy / canonical trace note

Supplier-side policy audit can still log `primary_image_not_square_like` on **raw** URLs; that does not prevent publish when the **approved disk pack** path is used (`integrationLayerOutcome: legacy_approved_pack` in remediation logs).

### Gate outcomes

- **Disk inspector:** dimensions and manifest approval satisfied.
- **Dual-gate on supplier URLs:** may still fail in trace (informational in `blockingReasons` list) without blocking publish once `packApproved` and integration rule above apply.
