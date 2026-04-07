# P105 — Supplement hero ranking and rebuild (32714)

## Ranking / trial order

Implemented in **`buildPortadaRebuildCandidateList`** (`candidate-scoring.service.ts`):

1. **`portada_supplement_hero`** — from `portadaSupplementHeroUrl` **or** `portadaSupplementHeroWorkspaceRelativePath` (mutually exclusive winner: URL first).
2. **`canonical_supplement`** — each entry in `mlImagePipeline.canonicalSupplementUrls` (deduped).
3. **`supplier`** — enumerated main candidates from product `images` (AliExpress URLs).

**Canonical ML pipeline URL merge** for Chile uses **`mergePortadaPriorityImageUrls`** so the same order applies to gallery-style URL lists (`ml-chile-canonical-pipeline.service.ts`).

## P103 rebuild integration

**`attemptMercadoLibreP103HeroPortadaFromUrls`** (`ml-portada-hero-reconstruction.service.ts`):

- Builds the plan above; **`portadaSourcePlan`** in the trace lists every candidate with **`sourceKind`**.
- Optional **`workspaceRoot`** in options resolves workspace-relative supplement paths consistently (e.g. tests / scripts).

### Fail-closed behavior (P105 rule 5)

When a supplement hero is **configured**:

- Unfetchable URL or missing/empty workspace file → immediate **`failClosedReason`** (no supplier trials).
- After a **loadable** supplement (and any **canonical** supplements in `loaded`), **supplier** rows are **removed** from the trial queue: **`supplierTrialsSuppressedForSupplementHero: true`** in the trace.
- If every allowed trial fails the stack → **`failClosedReason: portada_supplement_hero_exhausted_no_supplier_fallback`** (exact gate/isolation signals remain on **`trials[]`**).

There is **no silent fallback** to the seven AliExpress URLs when the supplement path is active.

## Winner provenance

On success: **`winningSourceKind`** (`portada_supplement_hero` | `canonical_supplement` | `supplier`) and **`winningUrl`** in the attempt result; P105 live script and remediation notes include **`winner_kind`**.

## Real trace (dry-run seed, 2026-03-27)

See **`p105-live-result.json`**:

- **`portadaSourcePlan[0]`** is `portada_supplement_hero` with `workspace:artifacts/ml-image-packs/product-32714/portada_supplement_hero.png`.
- **`supplierTrialsSuppressedForSupplementHero`**: `true`.
- **`failClosedReason`**: `portada_supplement_hero_exhausted_no_supplier_fallback` after strict+natural failure on the supplement trial.
