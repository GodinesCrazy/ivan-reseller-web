# P100 — Portada guardrail: final notes

## Confirmed real failure (32714)

- **Symptom:** Live ML moderation — portada **“Contiene logos y/o textos”** after a **technically successful** publish.
- **Pattern that slipped:** **P98-style catalog canvas** from the **primary supplier still** — sharpen + saturation + full-frame composition kept **high-frequency commercial structure** ML reads as **text/logo/graphic**, even though local dimensions and legacy gates passed.

## Why prior local policy missed it

- **URL / manifest heuristics** do not see pixels.
- **Hero / integrity / conversion gates** optimize subject and catalog safety but **do not** encode **ML’s post-publish graphic/text moderation**.
- **`packApproved` on disk** was previously possible **without** a **portada-specific pixel guard**.

## What changed in code (summary)

| Area | Change |
| --- | --- |
| `ml-portada-visual-compliance.service.ts` | Expanded signals: **L/R** bands, horizontal **stroke** density, **frame-vs-core** edges, **vertical seam**, **uncertainty** fail-closed; public **`evaluateMlPortadaStrictGateFromBuffer`**. |
| `mercadolibre-image-remediation.service.ts` | `cover_main` gate unchanged in placement; **`invalidRequired`** now includes **`approvalState === 'invalid'`**; **`unapprovedRequired`** excludes `invalid` to avoid duplicate blockers. |
| `ml-chile-canonical-pipeline.service.ts` | **Direct pass:** requires buffer + portada gate before **`raw_ordered`**. **Remediation:** portada gate on final **`out`** buffer before accepting a passing recipe. |

## Would this reject the historical bad case?

**Very likely yes:** the failure mode combines **strong peripheral commercial structure** (banner-like edges, sticker-like local contrast) typical of supplier creatives — the new **peripheral frame**, **grid fragmentation**, and **band** checks target that class. **Not guaranteed** without the exactpixels; if a future image is **minimal and product-dominant**, it may pass locally and still be moderated by ML.

## Remaining weakness (single statement)

**No OCR / trademark model** — subtle real logos on product bodies may pass locally and still be moderated offline.

## Single highest-leverage follow-up

Optional **server-side vision/OCR** hook (behind feature flag) keyed only to **`cover_main`**, invoked when heuristics are borderline — trade-off: cost, latency, and third-party dependency.
