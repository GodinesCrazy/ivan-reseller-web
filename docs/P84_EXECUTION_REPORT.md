# P84 — Execution report

## Objective

Add a **final cover preference stage** so that, among gate-passing remediated outputs, the canonical pipeline publishes the strongest commercial portada instead of the first passing one.

## Delivered

- `final-cover-preference.service.ts` — plan building, ordered attempts, `preferenceScore`, winner selection, tie-break.
- `policy-profiles.ts` — `isFinalCoverPreferenceEnabled`, `getFinalCoverPreferenceMaxFinalists`.
- `types.ts` — trace + `CanonicalFinalCoverPreferenceFinalistDetail` / `WinnerDetail`.
- `ml-chile-canonical-pipeline.service.ts` — preference-on remediation loop; legacy path when disabled.
- `check-ml-image-remediation.ts` + `env.local.example` — observability and env knobs.
- Tests + nine `docs/P84_*.md` files.

## Proof

Forced 32690 run: **2** finalists, explicit winner + beat reasons in `p84_32690_forced_raw.txt`.

## Rules compliance

- Gates not weakened; preference is post-pass only.
- Deterministic ordering and tie-break documented.
