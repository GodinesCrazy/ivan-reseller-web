# P79 — Real SKU re-validation (32690)

## Command

```bash
cd backend && npx tsx scripts/check-ml-image-remediation.ts 32690
```

## Result (2026-03-25, after P79)

| Field | P78 (weak inset era) | P79 (current workspace state) |
|-------|----------------------|----------------------------------|
| **`trace.finalOutcome`** | `remediated_pass` (inset) | **`remediated_pass`** |
| **`winningRecipeId`** | `inset_white_catalog_png` | **`square_white_catalog_jpeg`** (local pack candidate) |
| **`publishSafe`** | true | **true** |
| **Hero on direct path** | N/A | Example: supplier candidate **`s2eee…`** → **`heroPass: false`**, `hero_subject_area_ratio_0.408_below_0.42` while policy/conversion split fails anyway |

## Interpretation

- Current **on-disk** `cover_main.png` + **local-first** remediation order allows **`square_white_catalog_jpeg`** on the **local** buffer to pass **all three** gates before **inset** is needed; the trace showed **one** winning remediation attempt (square on local) with **`heroPass: true`**.  
- The **P78-problem class** (inset producing a **small subject on a large canvas**) is addressed by the **hero gate**: any remediated output with **trim metrics below thresholds** will **not** yield `pack_buffers`.  
- **Proof the weak inset class is blocked** is in **unit tests** (`postage-stamp` + **thin-strip** cases) and in **direct-path** traces where hero fails marginal compositions **before** publish.

## If inset runs again on 32690

When square fails and **inset** produces a **postage-stamp** hero, **`heroPass`** on that output should be **false** under current thresholds — pipeline must try the next candidate/recipe or fail closed to **human review**.
