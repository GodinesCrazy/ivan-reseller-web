# R1 — Execution report (research sprint)

## Mission

Deep **software-oriented** research on how leading **multichannel / feed / PIM / listing** systems handle **image selection, remediation, ordering, policy compliance, and scale** — foundation before refactoring Ivan Reseller’s publication image pipeline.

## Method

- Web search + **primary** vendor pages where possible (Feedonomics, Channable Help Center, Sellercloud Help, Zentail Help, Akeneo Help references).
- **Labeled** **INFERENCE** / **NOT PROVEN** where docs are marketing-only or incomplete.
- **Excluded:** pretending knowledge of **undocumented** internals (ChannelAdvisor depth, GeekSeller image AI, etc.).

## Deliverables (all under `docs/`)

| File | Purpose |
|------|---------|
| `R1_MARKETPLACE_IMAGE_PIPELINE_RESEARCH.md` | Umbrella synthesis + index |
| `R1_COMPETITIVE_SOFTWARE_COMPARISON.md` | Matrix + Mercado Libre note |
| `R1_IMAGE_SELECTION_PATTERNS.md` | Selection / ranking reality |
| `R1_POLICY_COMPLIANCE_PATTERNS.md` | Per-channel policy architecture |
| `R1_REMEDIATION_PATTERNS.md` | Crop/pad/template/AI/service |
| `R1_ORDERING_AND_SLOT_ASSIGNMENT_PATTERNS.md` | Slots, sort, projections |
| `R1_CONVERSION_VS_COMPLIANCE_BALANCE.md` | Ads vs listing safety |
| `R1_FALLBACK_AND_HUMAN_REVIEW_PATTERNS.md` | Fail closed, humans, alternates |
| `R1_RECOMMENDED_IVAN_RESELLER_IMAGE_ARCHITECTURE.md` | Actionable target design |
| `R1_EXECUTION_REPORT.md` | This checklist |

## Key findings (condensed)

1. **Channel-specific images** are the **clearest** enterprise pattern (Sellercloud docs).
2. **Rule + template feeds** dominate **scale** remediation (Channable, Feedonomics).
3. **PIM transforms + AI BG** are the **structured** DAM approach (Akeneo).
4. **Automatic “beauty ranking”** of supplier photos is **rarely documented**; **rules + optional scores** are more honest.
5. **Learning loops** from suppressions are **marketplace-visible**; **vendor automation** of retraining is **not proven** in sources read.

## Limitations

- **Spanish / Mercado Libre–centric** competitor documentation **underrepresented** in English web results.
- **No** live product demos or sales calls — **documentation gap** remains for several incumbents.

## Suggested next sprint (implementation)

See **`R1_RECOMMENDED_IVAN_RESELLER_IMAGE_ARCHITECTURE.md`** § Minimum viable increment.
