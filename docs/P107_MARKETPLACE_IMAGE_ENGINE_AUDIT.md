# P107 — Marketplace image engine audit

## End-to-end flow (Mercado Libre Chile)

| Stage | Location | Role |
|--------|-----------|------|
| **Ingestion** | `parseProductImageUrls`, canonical pipeline URL merge | Supplier / gallery URLs into ordered lists. |
| **Candidate ranking** | `rankPortadaSourceBuffersForP103`, `scoreImageCandidateFromBuffer` | Picks best *raw* frames for remediation fitness (not final ML moderation). |
| **Isolation** | `isolateProductSubjectToPng` (`ml-portada-hero-reconstruction.service.ts`) | Border-statistics segmentation → RGBA cutout. |
| **Reconstruction (pre-P107)** | Single compose: fixed 78% max side on **pure white** 1200² | One recipe; no variant search. |
| **Portada selection** | First source × first compose that passes all gates | No cross-recipe optimization. |
| **Validation** | `evaluateMlPortadaStrictAndNaturalGateFromBuffer`, `evaluateHeroCoverQualityOnBuffer`, `evaluateOutputIntegrityOnBuffer` | Strict+natural, hero, integrity. |
| **Publish payload** | `runMercadoLibreImageRemediationPipeline`, asset pack + `metadataPatch` | Approved local files or block. |

## Where automation was insufficient (pre-P107)

1. **Single reconstruction recipe** after isolation — real ML failures (sticker/collage, white-field dominance, harsh silhouette) often need **margin/scale/background** tweaks, not only one white canvas.
2. **No structured “source insufficient” classification** in remediation metadata for analytics at scale.
3. **Operational bias** toward supplement-hero path (P105) — correct for rescue, **not** a substitute for a stronger **automatic** engine.

## P107 changes

- **`ml-portada-recipes.service.ts`:** six named recipes (white @ 72/76/78/85% scale, light neutrals).
- **`attemptMercadoLibreP103HeroPortadaFromUrls`:** default **`multiRecipe: true`** — tries full recipe order per isolated source; trace includes **`recipeTrials`** and **`winningRecipeId`** when successful.
- **`ml-image-readiness.service.ts`:** `portadaAutomation` summary for **`metadataPatch`** after P103 runs in remediation.
- **Classification:** `AUTOMATIC_COMPLIANT_PORTADA_PRODUCED` | `IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE` | `SUPPLEMENT_HERO_CONFIGURED_FAIL_CLOSED`.
