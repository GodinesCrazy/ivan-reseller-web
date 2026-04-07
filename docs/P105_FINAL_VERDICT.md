# P105 — Final verdict (32714)

## What was implemented

- **Input path:** `mlImagePipeline.portadaSupplementHeroUrl` and `portadaSupplementHeroWorkspaceRelativePath` with validation and operational script **`backend/scripts/p105-supplement-hero-live-32714.ts`**.
- **Priority:** Supplement hero is **first** in `buildPortadaRebuildCandidateList` / `mergePortadaPriorityImageUrls`.
- **Rebuild:** Same P103 stack (isolation → white hero → strict+natural → hero quality → integrity).
- **Fail-closed:** No silent fallback to **supplier** URLs when supplement hero is configured; trace includes **`supplierTrialsSuppressedForSupplementHero`** and **`portada_supplement_hero_exhausted_no_supplier_fallback`** when all non-supplier trials fail.
- **Republish guard:** **`p101-clean-republish-32714.ts`** allows lineage mark **`p105`**.

## What was proven live (this environment)

Command:

```text
npx tsx scripts/p105-supplement-hero-live-32714.ts --dry-run --seed-from-pack-detail
```

**Supplement source used:** workspace file seeded from pack **`detail_mount_interface.png`** → **`portada_supplement_hero.png`**, metadata path **`artifacts/ml-image-packs/product-32714/portada_supplement_hero.png`**.

**Gate outcome:** Isolation **OK**; **strict+natural FAIL** (signals included sticker/collage risk, white-field dominance, harsh silhouette). **Suppliers not trialed** (suppressed).

**Live apply:** **Not run** (no passing buffer).

**Seller Center:** **Not verified** (no apply).

## Final product verdict (enum)

**`PRODUCT_32714_SUPPLEMENT_HERO_FAILED_GATES`**

**Reason:** A **real** supplement hero input was exercised (seeded from existing pack detail). It **ranked first** and **failed** the strict+natural layer; with P105 rules, **AliExpress URLs were not used** as fallback. A **cleaner** supplement (studio/human hero or curated HTTPS URL) is still required to pass the stack and unlock live apply.

## Single highest-leverage next move

Provide **`--url https://...`** to **`p105-supplement-hero-live-32714.ts`** (or place a **clean** PNG at the workspace path and persist metadata **without** `--dry-run`), then re-run; if gates pass, run **`--try-replace-ml MLC3805190796`** and validate **Seller Center**.
