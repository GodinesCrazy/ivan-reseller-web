# P80 — Real SKU re-validation (32690)

## Command

```bash
cd backend
npx tsx scripts/check-ml-image-remediation.ts 32690
```

Run: **2026-03-25** (after P80 integration).

## Results

| Field | Value |
|-------|--------|
| `trace.finalOutcome` | `remediated_pass` |
| `publishSafe` | `true` |
| `winningRecipeId` | `inset_white_catalog_png` |
| **Winning candidate** | Remote supplier image `Sd8adf1f1f796411e96d94f9f8c6d45440` (not the on-disk local pack blank) |

## Blank-output class blocked (proof)

Attempts on **`local:pack:product-32690:cover_main`** (the known near-white / useless cover):

- **Direct path:** `policy=true`, `conv=false`, `hero=true`, **`integrity=false`** — integrity fails on the bad buffer; no `direct_pass`.
- **Remediation `square_white_catalog_jpeg`:** policy/conversion/hero all true, **`integrity=false`** with failures including:
  - `integrity_signal_pixel_ratio_0.0000_below_0.018`
  - `integrity_near_white_pixel_ratio_1.0000_above_0.97`
  - `integrity_luminance_stdev_0.000_below_4.5_while_mean_255.00_high_near_uniform_bright`
  - `integrity_luminance_range_0.00_below_6_weak_global_contrast`
  - `integrity_suspected_trim_full_canvas_with_low_visible_ink_…`
- Same for **`inset_white_catalog_png`** on that local buffer — **integrity=false** (identical failure set).

So the **prior failure class** (“remediated near-blank still passes”) is **blocked** for that buffer. The run still reaches `remediated_pass` because a **later** supplier candidate produces a remediated output with **`integrityPass: true`** and acceptable pixel metrics.

## Comparison to P79

- P79 could still pass hero on a full-canvas trim of a white field.
- P80 adds pixel-level failures recorded in trace; the local blank can no longer be the winning remediated cover.
