# P105 — Supplement hero input path (product 32714)

## Source of truth

Persisted on **`products.productData`** (JSON string). Under **`mlImagePipeline`**:

| Field | Type | Rules |
|--------|------|--------|
| **`portadaSupplementHeroUrl`** | string (optional) | `http://` or `https://` only. If set and not fetchable/empty, P103 **fails closed** with `portada_supplement_hero_unfetchable_or_empty_buffer`. |
| **`portadaSupplementHeroWorkspaceRelativePath`** | string (optional) | Path **relative to repo workspace root** (same root as `artifacts/ml-image-packs/...`). Path traversal rejected. If set and file missing/empty, **fails closed** with `portada_supplement_hero_workspace_file_missing` or `portada_supplement_hero_workspace_file_empty_or_unreadable`. |

**Precedence if both are set:** HTTP URL wins; workspace path is ignored for ordering (workspace key cleared when merging URL via `p105-supplement-hero-live-32714.ts`).

## Operational script

From `backend/`:

```text
npx tsx scripts/p105-supplement-hero-live-32714.ts [--url <https://...>] [--workspace-relative <path>] [--seed-from-pack-detail] [--dry-run] [--try-replace-ml <ITEM_ID>]
```

- **`--seed-from-pack-detail`**: copies `detail_mount_interface.png` → `portada_supplement_hero.png` under the canonical pack dir and sets **`portadaSupplementHeroWorkspaceRelativePath`** to `artifacts/ml-image-packs/product-32714/portada_supplement_hero.png`. Requires **`detail_mount_interface.png`** to exist next to the pack.

## Legacy / secondary URLs

- **`mlImagePipeline.canonicalSupplementUrls`**: still supported as **canonical supplements** (ranked after the single supplement hero, before suppliers when no supplement hero is configured; when supplement hero is configured, suppliers are **not** trialed — see ranking doc).

## Proof artifact

Latest run output: repo-root **`p105-live-result.json`** (includes `productDataPatch` when flags merge metadata).
