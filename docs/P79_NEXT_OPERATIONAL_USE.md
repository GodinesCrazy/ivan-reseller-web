# P79 — Next operational use

## SKU 32690

- Re-run **`check-ml-image-remediation.ts 32690`** after any **cover** change.  
- If **`human_review_required`** with **`hero_gate:*`** reasons: **regenerate** a fuller-bleed hero (less inset, larger product share), or adjust **source** imagery — **do not** disable the gate for routine publishing.

## Future ML SKUs

- Expect **three** mandatory checks on canonical path: **Policy**, **Conversion**, **Hero**.  
- Traces show **which** gate failed; use **`heroMetrics`** to see **area / width / height / balance** vs profile thresholds.

## When to use human review

- No candidate + no remediated output passes **all three** gates → **`human_review_required`** (honest stop).
