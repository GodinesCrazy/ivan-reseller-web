# R1 — Recommended Ivan Reseller image architecture

**Status:** Research-derived recommendation for a **future implementation sprint**. Aligns with patterns where **evidence** existed (Sellercloud, Channable, Feedonomics, Akeneo, Zentail); augments gaps with **explicitly labeled** sensible defaults.

## Target architecture (high level)

```
Import (supplier URLs)
    → Normalize (dedupe, EXIF, download cache)
    → Candidate pool per SKU
    → Per-marketplace PolicyProfile (constraints + slot semantics)
    → Rank / Rule engine (first-match or score-then-threshold)
    → Transform pipeline (recipe DAG: pad | resize | bg | crop)
    → Validate (hard gates)
    → Approve state machine (auto | human | blocked)
    → Publish adapter (ordered picture IDs)
    → Reconcile loop (moderation / suppression / seller warnings)
```

## 1. Data model (copy from best ERP pattern)

- **`ProductImageAsset`:** stable id, source URL, hash, width/height, provenance (AliExpress key, user upload).
- **`MarketplaceImagePolicy`:** versioned JSON per `marketplace + listing_type` (min px, max MB, main: `bgColor?`, `textAllowed`, `occupancyHint`, gallery rules).
- **`ChannelImageAssignment`:** **Sellercloud-style** — optional override list per marketplace (not only one global gallery).
- **`ImageSlot`:** `role` (main, gallery, detail, context), `sortIndex`, `required`.

## 2. Selection: rules first, scoring second

- **Phase A — Rule engine (Channable-style):** ordered rules: e.g. “if ML Chile → exclude images with detail-only key”, “if any image passes ML main validator → pick first by supplier order”, “else try next URL”.
- **Phase B — Scorecard (internal):** edge texture, edge luminance, aspect, resolution — **Ivan already prototypes** (P74-style); treat as **signals**, not vendor magic.
- **Phase C — Alternate supplier image before heavy remediation** (user insight): **cheap** and often **beats** inpaint.

## 3. Compliance: validate, don’t hope

- **Validators** are pure functions over **bytes + policy** (and optional **OCR** later).
- **Separate** `main` vs `gallery` validators (pattern from Amazon + Sellercloud slot semantics).
- **Zentail-style** internal doc: link **official** marketplace help URLs inside validator error messages for operators.

## 4. Remediation: recipe DAG (Akeneo + Feedonomics)

Named recipes, e.g.:

- `mechanical_pad_to_square` (Feedonomics-like)
- `strip_annotation_bands` (Ivan P75-like, **SKU-scoped** constants)
- `neutral_shadow_crush`
- `background_remove_api` (optional **Photoroom/Remove.bg** — **not** in competitor core, **ecosystem** norm)

**Guardrail:** recipes declare `policyCompatibility[]` so you **cannot** apply “lifestyle template with text” to **ML main**.

## 5. Conversion vs compliance

- **Main image path:** **compliance-first**.
- **Gallery:** allow richer assets if policy permits.
- **Optional A/B** (Feedonomics-inspired): store **variant** URLs **only** where marketplace supports experiment; else **manual**.

## 6. Human review (mandatory for high-risk)

- Queue when: validator **fails** after max remediation, **AI** used, **first publish** to new marketplace, or **confidence < threshold**.
- **Channable-like** fail closed: **block publish** if configured strict.

## 7. Learning loop

- **Ingest** marketplace feedback: suppression reasons, **seller-center** warnings (manual capture until API exists), listing **health**.
- **Map** reason codes → **recipe adjustments** or **new rules** (human-approved config change).
- **NOT PROVEN** that a vendor does full auto-ML retraining; **safe default** is **human-in-the-loop** config updates.

## 8. Mercado Libre specifics (Ivan context)

- Treat **ML** as **first-class PolicyProfile** with **main-image** rules distinct from **eBay** / **Shopify**.
- Keep **listing-scoped** remediation constants (P75 lesson) or move to **SKU family** table if reused.
- **Monitor** upload API `max_size` vs local file — possible **second validator** on **platform-side** downscale.

## What NOT to copy blindly

- **Template text overlays** for **main** images on strict marketplaces (Feedonomics/Channable power **misused** = policy violations).
- **AI-generated mains** without **legal + policy** gates (Helium 10–style capability).

## Minimum viable increment (after R1)

1. **Channel-specific main image override** (even before full DAM).  
2. **Validator + fail + human queue** for **one** marketplace (ML).  
3. **Documented recipe** list with **explicit** allowed marketplaces per recipe.
