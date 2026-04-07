# P104 — P103 live execution (product 32714)

## Command executed

```bash
cd backend
npx tsx scripts/p103-hero-rebuild-32714.ts
```

**Exit code:** `4`  
**Timestamp (JSON):** `2026-03-27T19:31:10.296Z`

## Artifact

Full output persisted at repo root: **`p103-rebuild-result.json`**.

## Summary outcome

| Field | Value |
|--------|--------|
| `p103AttemptOk` | **false** |
| `fatalError` | `p103_all_ranked_candidates_failed_gates_or_isolation` |
| `winningUrl` | **null** |
| `winningObjectKey` | **null** |
| `writtenCoverPath` | **not written** (no candidate passed all gates) |
| Supplier URLs processed | **7** |

## Ranked sources (rank 1)

- **URL:** `https://ae01.alicdn.com/kf/S4005cfbe2ecc4d22bd0f51da34bfc1c6M.jpg`
- **objectKey:** `s4005cfbe2ecc4d22bd0f51da34bfc1c6m`
- **remediationFitness:** 82.32 (highest)

Full ranked table and per-trial traces are in `p103-rebuild-result.json` → `p103Trace`.

## Gate failure pattern (all trials)

Isolation succeeded for every URL (`isolationOk: true`). **Strict+natural** failed on every reconstructed hero. Recurring signals:

1. `portada_natural_look_harsh_silhouette_vs_white_field_sticker_or_cutout_risk` — **all 7 trials**
2. `portada_high_local_contrast_fragmentation_sticker_collage_risk` — ranks 1–3
3. `portada_white_background_insufficient_near_white_dominance` — ranks 1–3, 6
4. `portada_right_band_uncertain_fail_closed` — rank 5

**Conclusion:** With current isolation + gates, **no AliExpress frame in the set produces an automated P103 portada that passes fail-closed validation.**
