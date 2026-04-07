# P82 — Decision engine integration

## Integration point

Only the **remediation branch** of `runMlChileCanonicalPipeline` changes:

- After `direct_pass_exhausted_try_remediation`, the pipeline builds `byRemediation` (P81 sort).
- If simulation is enabled, it computes `remediationOrder = [sim-ranked shortlist…][remainder…]`.
- The existing `for (const s of remediationOrder)` loop is unchanged: full `applyRecipe` + production gates.

## Non-weakening guarantees

- **No** change to `evaluateDualGatesOnOutputBuffer` thresholds for final outputs.
- **No** change to hero or integrity gate logic for final outputs.
- Simulation uses **`evaluateSimulationDualGatesOnOutputBuffer`** only for preview ranking.

## Fail-closed / human review

If **no** preview row achieves `simAllCorePass` (simulation dual + hero + integrity), `trace.remediationSimulationAllWeak` is set. The pipeline **still** attempts full remediation (preview may be stricter/looser than full-res in edge cases). If everything fails, terminal `human_review_required` includes `remediation_simulation_all_weak_preview` when that flag is set.

## Determinism

- Fixed sort tie-break: original shortlist index when `simScore` ties.
- Fixed env defaults when unset.
