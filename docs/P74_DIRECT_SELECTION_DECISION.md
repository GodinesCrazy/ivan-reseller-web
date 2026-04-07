# P74 — Direct-selection decision

## Decision

**`remediation_required`**

## Rationale

Seller-side truth (P73) for **MLC3786354420** / **32690**: portada rejected for **logos/text** and **non-light / non-plain background**.

Deterministic scoring (`p74-execute-cover-strategy.ts`) applied strict **directPass** thresholds:

- Light, low-texture **edge** field (mean ≥ 228, edge stdev ≤ 22).
- Sensible **center** occupancy (mean band, stdev floor).

**Zero** of the five enumerated real images satisfied **directPass**. Edge strip stdev stayed high (≈47–66), consistent with packaging, lifestyle context, or peripheral graphics—not a clean seamless catalog field.

## Best base candidate (for remediation)

| Field | Value |
|--------|--------|
| objectKey | `s2eee0bfe21604c31b468ed75b002ecdc8` |
| URL | `https://ae01.alicdn.com/kf/S2eee0bfe21604c31b468ed75b002ecdc8.jpg` |
| Why | Highest **remediationFitness** (60.73): brightest edge mean among candidates, least-bad edge texture relative to peers; aligns with P73 winner choice for catalog treatment. |

## What was not chosen

**`direct_selection_viable`** — would require uploading a supplier JPEG with no further treatment; none met the strict ML-aligned gate, so that path would likely repeat the same seller warnings.
