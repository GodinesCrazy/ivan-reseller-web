# P103 — Subject isolation and portada rebuild (32714)

## Isolation

`isolateProductSubjectToPng` (in `ml-portada-hero-reconstruction.service.ts`):

1. Rotate, flatten on white, downsample (long edge ≤ **720**) for mask work.
2. Sample **border strip** RGB mean/variance; classify pixels by Euclidean distance to border mean (adaptive threshold).
3. Morphology: erode → dilate×2 on binary mask; keep **largest 4-connected foreground component**; reject if area ratio outside **[~2.6%, ~94%]**.
4. Dilate once, export **binary mask → blur (~1.05) → resize to full resolution** as alpha; build **RGBA PNG cutout**.

## Hero reconstruction

`composeMercadoLibreP103HeroOnWhite`:

- Resize cutout to fit inside **78%** of **1200×1200** (max **936** px).
- Composite centered on **RGB white** `#ffffff` canvas; output **PNG**.

## Fail-closed behavior

`attemptMercadoLibreP103HeroPortadaFromUrls` tries ranked candidates until one yields:

- Successful isolation + compose
- `evaluateMlPortadaStrictAndNaturalGateFromBuffer` **pass**
- `evaluateHeroCoverQualityOnBuffer` **pass**
- `evaluateOutputIntegrityOnBuffer` **pass**

Otherwise **`ok: false`** with per-trial trace (`trials[]`).

## Artifacts (local)

After a successful script run:

- **Chosen source:** `winningUrl` in `p103-rebuild-result.json`
- **Reconstructed portada:** canonical pack `cover_main.png` (path in `writtenCoverPath`)
