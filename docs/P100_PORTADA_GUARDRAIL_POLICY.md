# P100 — Portada guardrail policy (canonical Mercado Libre Chile)

## Authority

**Live Mercado Libre moderation** (e.g. “Contiene logos y/o textos”) is the **source of truth**. Local checks are **conservative proxies** that **fail closed** when behavior is ambiguous.

## Slot contract: `cover_main` is the strictest asset

- **`cover_main`** is the only pack slot that must pass **`evaluateMlPortadaStrictGate`** / **`evaluateMlPortadaStrictGateFromBuffer`**.
- **`detail_mount_interface`** and optional assets are **not** subject to this full portada policy (existing hero/integrity/policy gates still apply where relevant).

## Mandatory rejection signals (non-exhaustive)

Implementation: `backend/src/services/ml-portada-visual-compliance.service.ts`.

Structural proxies aim to catch:

| Intent | Mechanism (high level) |
| --- | --- |
| Banner / promo strip | High Sobel edge energy in **top** or **bottom** band vs visual “middle” reference. |
| Sidebars / vertical promos | Same comparison on **left** / **right** bands (**~22%** width each — wide enough for real supplier strips). |
| Text-like / noisy overlays | Many horizontal “stroke” rows in the **upper** region; fragmented high local contrast in a **10×10** grid. |
| Collage / two-panel | Strong vertical-edge column at **horizontal center** (split seam) vs side references. |
| Screenshot / UI framing | **Peripheral** edge energy vs **core** (UI chrome and frames dominate edges outside the subject). |
| Global busy + peripheral bias | High global edges **and** elevated top/bottom/left/right bias together. |
| Uncertainty | **Soft bands** below the hard fail threshold still **reject** (`*_uncertain_fail_closed`). |

If **any** signal fires → **`pass: false`** → candidate or file cannot be approved as portada.

## Where the policy is enforced (real selection + approval)

1. **On-disk pack approval:** `inspectAsset` for `cover_main` in `mercadolibre-image-remediation.service.ts` — failed gate forces **`approvalState: invalid`** and blocks **`packApproved`** (with `invalid_required_assets` / notes).
2. **Canonical “direct” path (no remediation):** `runMlChileCanonicalPipeline` in `ml-chile-canonical-pipeline.service.ts` — requires a **loadable buffer** and **`evaluateMlPortadaStrictGateFromBuffer`** before returning **`raw_ordered`** (prevents publishing a raw URL as portada without passing the gate).
3. **Canonical remediation outputs:** Same service, after dual-gate + hero + integrity pass on **`out`**, **`evaluateMlPortadaStrictGateFromBuffer(out)`** — failed gate **discards** that remediation attempt so the next candidate/recipe can be tried; if none pass → **`human_review_required`**.

## Known limitation (explicit)

These heuristics **do not** run OCR or logo detection. They **reduce** false approvals; they **cannot guarantee** ML will never flag an image. When in doubt, the design **rejects**.
