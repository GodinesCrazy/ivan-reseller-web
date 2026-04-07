# P79 — Future publication inheritance

## Default-on

- Hero gate runs whenever **canonical ML pipeline** runs and **`ML_HERO_COVER_GATE`** is not `0` / `false`.  
- Same entry points as P76/P77: `runMercadoLibreImageRemediationPipeline` → `runMlChileCanonicalPipeline` → publisher / pre-publish validator.

## No gate weakening

**Policy** and **Conversion** thresholds in `dual-gate.service.ts` and **`dualGate`** in the profile are **unchanged**.

## Operator override

- **Global off:** `ML_HERO_COVER_GATE=false` (documented in `env.local.example`).  
- **No per-SKU JSON override** in v1 — intentional to avoid silent storefront quality regressions.

## Portada focus

The gate is evaluated on **main / cover** buffers on the **direct** and **remediation** paths that target the **hero** asset in canonical flow.
