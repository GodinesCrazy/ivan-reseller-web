# P78 — Current failure trace analysis (32690, before closure)

## Source: P77 / pre-P78 canonical run

### Direct path (recurring)

| Blocker | Where seen |
|---------|------------|
| **`text_logo_risk_high_100`** | All AliExpress candidates + high-rank edges |
| **`policy_fitness_*_below_68`** | All supplier JPEGs; best combined ~56–62 |
| **`background_not_simple_*`** | Busy lifestyle shots |
| **`catalog_look_weak_*`** | Some candidates |

### Local approved pack (after P78 hook, before inset)

Once `canonicalEvaluateLocalApprovedCover` scored `artifacts/.../cover_main.png`:

| Metric | Approximate |
|--------|-------------|
| **policyFitness** | **67.34** (0.66 below gate minimum 68) |
| **conversionFitness** | 68.31 (pass) |
| **textLogoRisk** | **100** (dual-gate hard fail: `> 82`) |
| **Remediation `square_white_catalog_jpeg` on local** | **`output_edge_texture_high_50.6`** (output policy fail) |

### Root cause summary

Supplier URLs alone could not satisfy **policy + conversion** gates. The self-hosted **approved** PNG was **much closer** but still blocked by **edge-derived text/logo proxy** and **just-under** policy fitness, and **square JPEG remediation** did not tame **output edge texture** enough.

### Missing inset (pre-fix)

`inset_white_catalog_png` was **skipped** because `mlImagePipeline.insetCrop` was unset (`skip_recipe_inset_white_catalog_png_no_inset_override`).
