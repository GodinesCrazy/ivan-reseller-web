# ML Image Pipeline — Current State Audit

> Audit date: 2026-04-02 | Auditor: Ivan Reseller Web Engineering

---

## 1. Pipeline Overview

The image remediation pipeline is a multi-layer system that processes raw supplier (AliExpress) images into Mercado Libre-compliant asset packs. The primary entry point is `runMercadoLibreImageRemediationPipeline()` in `backend/src/services/mercadolibre-image-remediation.service.ts`.

### High-Level Flow

```
Raw supplier image URLs
        │
        ▼
[Policy Audit]  ─── auditMercadoLibreChileImagePolicy()
        │
        ▼
[Decision Engine]  ─── evaluateMercadoLibreImageRemediationDecision()
        │
   ┌────┴────────────────┬──────────────────────┐
   ▼                     ▼                      ▼
pass_as_is         auto_remediate         manual_review
                   │                      (AI generation)
              ┌────┴────────┐
              ▼             ▼
   internal_process   canonical_pipeline_v1
   _existing_images   (P76 dual-gate)
              │
              ▼
   autoGenerateSimpleProcessedPack()
              │
         ┌────┴──────────────────────┐
         ▼                           ▼
   Phase 1: Isolation            Phase 2: Soft BG
   (product cutout on white)     Neutralization
         │                           │
         ▼                           ▼
   Quality gate pass?           Phase 3: Absolute
   (not >95% white,             Fallback (flatten+
    not >5% warm gray)          extend on white)
```

---

## 2. File Inventory

| File | Purpose |
|---|---|
| `mercadolibre-image-remediation.service.ts` | Main orchestration; `autoGenerateSimpleProcessedPack()` |
| `image-pipeline.service.ts` | Download + normalize (resize to 1200–4096px, JPEG) |
| `image-validation.service.ts` | Multi-layer validation (resolution, format, aspect ratio) |
| `mercadolibre-image-policy.service.ts` | Policy compliance audit engine |
| `mercadolibre-image-executor.service.ts` | AI-powered generation (OpenAI/Gemini/self-hosted) |
| `ml-portada-visual-compliance.service.ts` | Three internal quality gates (strict, white-bg, natural look) |
| `ml-portada-isolation.service.ts` | Border-statistics product segmentation (4 variants) |
| `ml-portada-hero-reconstruction.service.ts` | Autonomous P103/P108/P109 recovery orchestrator |
| `ml-portada-recipes.service.ts` | Canvas composition (white 78/72/76/85%, neutral f9, gray f6) |
| `ml-portada-studio-prep-p109.service.ts` | Studio-style colour manipulation pre-compose |
| `ml-portada-advanced-recovery.service.ts` | Alpha feather / morphology recovery waves (P108) |
| `ml-portada-source-ranking.service.ts` | Ranks source image URLs by visual quality |
| `ml-portada-compliance-v2.service.ts` | **NEW** — Comprehensive ML-aligned compliance validator |
| `marketplace-image-pipeline/ml-chile-canonical-pipeline.service.ts` | P76 dual-gate pipeline |
| `marketplace-image-pipeline/remediation-recipes.service.ts` | Named recipes; neutral crush function |
| `marketplace-image-pipeline/hero-cover-quality-gate.service.ts` | Subject dominance via trim ratio |
| `marketplace-image-pipeline/output-integrity-gate.service.ts` | Final output integrity check |

---

## 3. Phase-by-Phase Analysis of `autoGenerateSimpleProcessedPack`

### Phase 1 — Isolation Pipeline (WHITE background — CORRECT)

**What it does:**
1. Downloads all available source images.
2. For each source × 4 segmentation variants: runs `isolateProductSubjectToPngWithVariant()`.
3. Composes isolated cutout onto 1200×1200 white canvas with 78% product fill (`p107_white_078`).
4. Quality gate: rejects if >95% white (product invisible) or >5% warm-gray pollution.
5. Returns first composition that passes.

**Output:** JPEG, 1200×1200, pure white background.

**Status:** ✅ Correct and ML-compliant when it succeeds.

**Failure mode:** AliExpress images with complex backgrounds, low contrast, or backgrounds similar in colour to the product cause all 4 segmentation variants to fail or produce compositions that fail the quality gate. When this happens, falls to Phase 2.

---

### Phase 2 — Soft Background Neutralization (FIXED: was gray, now WHITE)

**What it does (before fix):**
1. Detects dominant background colour via top-row sampling.
2. Replaces pixels near-background with `SOFT_GRAY = 220` (#dcdcdc).
3. Blends transition pixels between gray and original colour.
4. Composes result on **gray canvas** (#dcdcdc background).

**Why it was wrong:**
- Gray (#dcdcdc = RGB 220,220,220) is explicitly NOT white.
- ML's `white_background` moderation check requires pure white (#FFFFFF).
- A gray background produces 0% pure-white pixels and ~0% near-white in background areas.
- This reliably triggered "No tiene fondo blanco" in ML's automated moderation.
- **Additionally:** `portadaGateBypass: true` was unconditionally set in the manifest, causing our own internal white-background gate to be skipped — so the defect was invisible to the internal validation layer.

**What it does (after fix — 2026-04-02):**
1. Detects background colour (same as before).
2. Replaces near-background pixels with `SOFT_WHITE = 255` (#FFFFFF).
3. Blends transition pixels toward white.
4. **Quality gate added:** Rejects candidate if >95% near-white (product invisible on white).
5. Composes result on **white canvas** (#FFFFFF).
6. Manifest notes now record `phase=phase2_soft_bg_neutralization_white | bg=white_255 | ml_white_background_compliant`.

**Status after fix:** ✅ Output now produces white background compliant with ML `white_background` check.

---

### Phase 3 — Absolute Fallback (flatten + extend on white)

**What it does:**
1. Takes first source image.
2. `.flatten({background: '#ffffff'})` — removes transparency, fills with white.
3. `.resize(960, 960, {fit: 'contain', background: '#ffffff'})` — centres on white.
4. `.extend({...background: '#ffffff'})` — adds white margins to 1200×1200.

**Status:** Produces white background. However:
- `flatten` only removes alpha transparency, does not remove a non-white solid background.
- AliExpress images with gray/coloured backgrounds will preserve those backgrounds through `flatten`.
- Result may show original non-white background colour in the frame.
- This is the **last resort only** — should rarely fire if Phase 1 or 2 succeeds.

---

## 4. Known Root Causes of ML Rejection (Before Fix)

### Primary: Gray background from Phase 2

| Issue | Impact |
|---|---|
| `SOFT_GRAY = 220` → gray canvas | 100% of Phase-2 outputs fail ML `white_background` check |
| `portadaGateBypass: true` unconditional | Our internal white-bg gate was silently skipped |
| No post-composition white validation | No way to catch the defect internally before publish |

### Secondary: Phase 1 quality gate over-rejection

The quality gate in Phase 1 rejects compositions where:
- >95% of pixels are near-white (product invisible)
- >5% warm-gray pollution

For AliExpress cat stand / accessory images with subtle isolation boundaries, ALL variants fail this gate, forcing Phase 2. The gate is correct in principle but may be rejecting compositions where the product IS visible but the isolation is imperfect.

### Tertiary: White background threshold mismatch in visual compliance

Before tightening (2026-04-02):
- `WHITE_PURE_DOMINANCE_MIN = 0.28` — only 28% pure-white pixels required
- `WHITE_NEAR_DOMINANCE_MIN = 0.58` — only 58% near-white required
- A gray background could theoretically pass if border/corner checks were also bypassed

After tightening:
- `WHITE_PURE_DOMINANCE_MIN = 0.40` — 40% pure-white required
- `WHITE_NEAR_DOMINANCE_MIN = 0.62` — 62% near-white required

---

## 5. Internal Validator Gaps (Pre V2)

| Gap | Description |
|---|---|
| No product coverage check in simple path | `autoGenerateSimpleProcessedPack` has no check for product area ratio vs canvas |
| No product centering check | Only the hero reconstruction path runs the hero cover quality gate |
| No over-exposure check | A washed-out product on a white background is not detected |
| `portadaGateBypass` is unconditional | Was set even for Phase-2 gray outputs, silently disabling white-bg gate |
| Soft neutralization threshold | Old visibility score > -1 (any score was accepted); now requires <95% near-white |

---

## 6. What Changed (2026-04-02 Remediation)

| File | Change |
|---|---|
| `mercadolibre-image-remediation.service.ts` | Phase 2: SOFT_GRAY→SOFT_WHITE, grayBg→whiteBg, added >95% white quality gate, phase tracking label in manifest notes |
| `ml-portada-visual-compliance.service.ts` | WHITE_PURE_DOMINANCE_MIN: 0.28→0.40, WHITE_NEAR_DOMINANCE_MIN: 0.58→0.62 |
| `ml-portada-compliance-v2.service.ts` | NEW: comprehensive compliance validator (6 checks, compliance score 0–100) |
| `__tests__/ml-portada-compliance-v2.service.test.ts` | NEW: 11 regression tests covering all failure modes |
