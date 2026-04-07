# P103 — Canonical Mercado Libre portada automation

## Non-negotiable flow

1. **Rank** raw supplier URLs (`rankPortadaSourceBuffersForP103` / remediationFitness-first).
2. **Select** best sources in order; do **not** assume the previous `cover_main` URL is best.
3. **Isolate** product subject (`isolateProductSubjectToPng`).
4. **Reconstruct** hero on white (`composeMercadoLibreP103HeroOnWhite`).
5. **Validate** — strict structural + white gate **and** P103 **natural-look** gate **and** hero **and** output integrity.
6. **Publish / update** only on full pass; otherwise fail closed.

## Where it runs in production code

| Location | Behavior |
|----------|----------|
| `ml-chile-canonical-pipeline.service.ts` | Direct path + remediation outputs must pass **`evaluateMlPortadaStrictAndNaturalGateFromBuffer`** (strict + natural). |
| `mercadolibre-image-remediation.service.ts` | After `inspectMercadoLibreAssetPack`, if **`cover_main` is invalid** and supplier URLs exist, **`attemptMercadoLibreP103HeroPortadaFromUrls`** rewrites `cover_main.png` + manifest (unless `ML_P103_HERO_REBUILD=false`). |
| `inspectMercadoLibreAssetPack` | `cover_main` uses **`evaluateMlPortadaStrictAndNaturalGateFromBuffer`** for approval. |

## Environment

- **`ML_P103_HERO_REBUILD`**: default on; set `0` / `false` to disable automatic disk rewrite after inspection failure.

## Natural-look gate (P103)

`evaluateMlPortadaNaturalLookGateFromBuffer` in `ml-portada-visual-compliance.service.ts` — fail-closed proxies for **flat sticker interior**, **harsh silhouette vs calm white field**, **tinted white border**, and **extreme subject extent** on downsampled analysis (480×480 cover crop).
