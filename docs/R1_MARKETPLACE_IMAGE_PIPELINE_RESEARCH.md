# R1 — Marketplace image pipeline research (synthesis)

**Sprint type:** Investigation only (no Ivan Reseller implementation).  
**Date:** 2026-03-25  
**Method:** Public documentation, help centers, vendor feature pages, and selected third-party summaries. Unknowns are labeled **NOT PROVEN**.

## Executive answer to the key question

Strong multichannel and feed-management products rarely rely on a **single** “smart” image chooser. The recurring pattern is:

1. **Normalize and store** a master set of assets (URLs or DAM).
2. **Apply channel-specific rules** (mapping, transforms, or entirely different images per channel).
3. **Automate mechanical fixes** at scale (resize, pad, format, template compositing).
4. **Fail closed or route to humans** when rules cannot guarantee compliance.
5. **Measure** (A/B, feed errors, channel reports) where the product exposes it.

**Pure “rank supplier images by ML-detected quality and auto-publish”** appears more often in **listing-AI** tools (e.g. Helium 10–style positioning) than in **core ERP/listing** suites, where **explicit rules + optional services** dominate.

## Evidence map (where we looked)

| Source type | Examples used in R1 |
|-------------|---------------------|
| Vendor help / product | Feedonomics, Channable, Sellercloud, Zentail, Akeneo |
| Marketplace policy links (via Zentail etc.) | Amazon, Walmart, eBay official help |
| Blogs / marketing | GoDataFeed, Salsify, Helium 10 announcements |
| NOT accessed | Private contracts, internal admin UIs, most tools’ full pricing/feature matrices |

## Cross-doc index

| Topic | Doc |
|-------|-----|
| Tool-by-tool matrix | `R1_COMPETITIVE_SOFTWARE_COMPARISON.md` |
| Selection / ranking | `R1_IMAGE_SELECTION_PATTERNS.md` |
| Policy per marketplace | `R1_POLICY_COMPLIANCE_PATTERNS.md` |
| Crop / BG / AI | `R1_REMEDIATION_PATTERNS.md` |
| Cover vs gallery | `R1_ORDERING_AND_SLOT_ASSIGNMENT_PATTERNS.md` |
| Conversion vs rules | `R1_CONVERSION_VS_COMPLIANCE_BALANCE.md` |
| Fallbacks | `R1_FALLBACK_AND_HUMAN_REVIEW_PATTERNS.md` |
| Ivan architecture | `R1_RECOMMENDED_IVAN_RESELLER_IMAGE_ARCHITECTURE.md` |
| Sprint log | `R1_EXECUTION_REPORT.md` |

## Top patterns (actionable)

1. **Channel-specific image sets** (different main image for Amazon vs lifestyle elsewhere) — **explicit** in Sellercloud documentation.
2. **Rule + template pipelines** per output feed (IF/THEN, ordering, store URL) — **explicit** in Channable Image Editor / Feedonomics processing descriptions.
3. **Mechanical compliance** (padding to destination aspect/size) — **explicit** Feedonomics.
4. **PIM-style transforms** (resize, autocrop, background removal) — **explicit** Akeneo Asset Manager / Smart Edit (edition-dependent).
5. **Operational learning** from suppressions/reports — **partially explicit** for Amazon (seller-facing reports); **NOT PROVEN** as automated closed-loop inside most third-party tools without per-vendor confirmation.

## Gaps (honest)

- **Mercado Libre–specific** automation in Western multichannel suites is **thin** in English public docs; ML sellers often use **ML’s own bulk/photo tools** + partners (e.g. GeekSeller mentioned generically in blogs, **no detailed image AI found** in this sprint).
- **True** “detect text/logo and auto-remediate” inside SaaS is **rarely documented** at pixel level; more often **templates + manual/DAM** or **external AI APIs** (inferred).
