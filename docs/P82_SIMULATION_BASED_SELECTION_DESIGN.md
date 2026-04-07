# P82 — Simulation-based selection design

## Selection flow (canonical remediation branch)

1. **Base screening (unchanged):** enumerate → score → direct path (policy + conversion + hero + integrity).
2. **Heuristic shortlist:** sort candidates by `remediationFitness` (P81). Take the top **N** (default **5**, env-tunable).
3. **Preview input shrink:** resize each candidate buffer to max input dimension (default **900px** long edge, fit inside, no upscale) for faster decode/transform.
4. **Recipe simulation:** for each shortlist candidate, for each recipe in `defaultRemediationRecipeChain` (skip `inset_white_catalog_png` if no inset override), run **`applyRecipePreview`** (P82 preview implementations).
5. **Gate evaluation (simulation-grade):**
   - `evaluateSimulationDualGatesOnOutputBuffer` — same edge/global signals as production output policy/conversion, **without** the 1000×1000 minimum dimension hard fail
   - `evaluateHeroCoverQualityOnBuffer` — **unchanged** (P79)
   - `evaluateOutputIntegrityOnBuffer` — **unchanged** (P80)
6. **Per (candidate, recipe) score:** `simScore` (deterministic weighted sum; see `remediation-simulation.service.ts`).
7. **Per-candidate aggregate:** keep the **best** `simScore` across recipes for ordering.
8. **Final remediation order:** simulated shortlist candidates sorted by best `simScore` (desc), then append remaining candidates in original `remediationFitness` order.
9. **Final publish pass (unchanged):** full `applyRecipe` + production `evaluateDualGatesOnOutputBuffer` + hero + integrity on **full-resolution** output.

## What is simulated

- **Recipes:** same logical steps as production, with **scaled constants** (preview square min side 960; preview inset canvas 1152 vs 1536).
- **Gates:** hero + integrity are full; policy/conversion on output use the **simulation** variant to allow sub-1000px preview dimensions.

## How many candidates

- Default **N = 5** via `ML_REMEDIATION_SIM_MAX_CANDIDATES` (clamped 1–12).

## Disable / break-glass

- `ML_REMEDIATION_SIMULATION=0` or `false` → fall back to P81 `remediationFitness` order only.
