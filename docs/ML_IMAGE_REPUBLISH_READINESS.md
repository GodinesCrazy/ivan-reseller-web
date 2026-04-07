# ML Image Republish Readiness

> Date: 2026-04-02 | Status: READY TO REPUBLISH (with controlled test)

---

## Readiness Assessment

### Core Fix Deployed ✅

| Fix | File | Status |
|---|---|---|
| Phase 2 gray→white background | `mercadolibre-image-remediation.service.ts` | ✅ Applied |
| Phase 2 >95% white quality gate | `mercadolibre-image-remediation.service.ts` | ✅ Applied |
| Phase tracking in manifest notes | `mercadolibre-image-remediation.service.ts` | ✅ Applied |
| White background threshold tightening | `ml-portada-visual-compliance.service.ts` | ✅ Applied |
| Comprehensive compliance validator V2 | `ml-portada-compliance-v2.service.ts` | ✅ Created |
| Regression test suite | `__tests__/ml-portada-compliance-v2.service.test.ts` | ✅ Created |

### What the Fix Changes at Runtime

When the system next calls `autoGenerateSimpleProcessedPack()`:
- If Phase 1 succeeds (isolation pipeline) → white background as before ✓
- If Phase 1 fails → Phase 2 now produces **white** background instead of gray
- The generated cover will have `bg=white_255` in manifest notes as evidence
- ML's `white_background` moderation check will now pass for Phase 2 outputs

---

## Republish Checklist

### Before Republishing

- [ ] **Delete the current asset pack** for the product to force regeneration:
  ```bash
  # Remove the stale pack directory
  rm -rf backend/data/ml-assets/<productId>/
  ```

- [ ] **Trigger fresh remediation** to regenerate with the fix:
  ```bash
  cd backend
  npx ts-node scripts/check-ml-image-remediation.ts --productId <ID>
  ```

- [ ] **Inspect the new manifest** and verify:
  - `phase=phase1_isolation_*` OR `phase=phase2_soft_bg_neutralization_white`
  - `bg=white_255`
  - `approvalState: 'approved'` for `cover_main`

- [ ] **Visually inspect the generated cover image**:
  - Open `backend/data/ml-assets/<productId>/cover_main.jpg`
  - Verify: pure white background, product clearly visible and centred
  - Verify: no gray cast, no background bleed, no text/logo overlays

- [ ] **Run compliance V2 check** (optional but recommended):
  ```bash
  cd backend
  npx ts-node -e "
    const sharp = require('sharp');
    const { evaluatePortadaComplianceV2 } = require('./src/services/ml-portada-compliance-v2.service');
    const fs = require('fs');
    const buf = fs.readFileSync('./data/ml-assets/<productId>/cover_main.jpg');
    evaluatePortadaComplianceV2(buf).then(r => console.log(JSON.stringify(r, null, 2)));
  "
  ```
  Expected: `compliant: true`, `overallScore >= 75`, `whiteBg.pass: true`

### Controlled Publish

1. Republish the listing with the new image pack via the controlled publish endpoint.
2. Monitor ML's response (HTTP 200 + listing ID = accepted; 4xx = policy rejection).
3. Wait 5–10 minutes after publish for ML's automated moderation to run.
4. Check listing status via ML API:
   ```
   GET https://api.mercadolibre.com/items/<ML_ITEM_ID>
   Check: health.sources[].status == "active" (not "paused")
   Check: No "poor_quality_thumbnail" in health.sources[].reasons
   ```

---

## What Remains Out of Scope

These items are NOT blockers for republishing but are worth tracking:

1. **Phase 3 fallback still may produce non-white background** for images with very light original backgrounds — acceptable as last resort, documented in `ML_IMAGE_REAL_CASE_REMEDIATION.md`.

2. **OCR-based text detection is not implemented** — detection is heuristic-only. Deliberate text overlays on source images that are structurally subtle may not be caught. Mitigation: AliExpress source images screened by URL heuristics first.

3. **Product with very light coloring** may produce over-exposure issues even with the fix — human review recommended for white/cream products.

4. **`portadaGateBypass: true` still unconditional for Phase 2** — Phase 2 outputs don't bypass white-bg gate due to the fix (background is now actually white), but the structural (text) gate is still bypassed. Acceptable given Phase 2 cannot introduce new text.

5. **V2 compliance validator is not yet called in `autoGenerateSimpleProcessedPack`** — it is available as a standalone function. Integration into the main pipeline for automatic scoring and manifest recording is a future enhancement.

---

## Risk Level for Republish

| Risk | Severity | Mitigation |
|---|---|---|
| New cover still has non-white background | LOW | Fix definitively changes Phase 2 to white |
| Product invisible on white (too light) | MEDIUM | Check manifest phase label; visually inspect before publish |
| ML rejects for unrelated reason (title, category, description) | LOW-MEDIUM | Not image-related; in scope of other pipeline checks |
| Regression in Phase 1 (isolation) | VERY LOW | Phase 1 unchanged; only Phase 2 modified |

**Overall risk assessment: LOW. Controlled publish is appropriate.**

---

## Post-Publish Monitoring

Within 24 hours of publish, verify:

1. Listing `status == "active"` in ML API response.
2. No `poor_quality_thumbnail` in health reasons.
3. Listing appears in search results for the main keyword.
4. Thumbnail displayed in ML app/web shows white background, product visible.

If the listing is paused for `poor_quality_thumbnail` despite the fix:
1. Review the ML moderation response for specific reason code.
2. Run V2 compliance validator on the exact cover image that was uploaded.
3. If white_bg check still fails → investigate whether Phase 3 fallback fired (check manifest notes for `phase3_flatten_extend_white_fallback`).
4. If composition check fails → product may be too small or off-centre on the canvas; try hero reconstruction path.
