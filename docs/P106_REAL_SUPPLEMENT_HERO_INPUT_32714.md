# P106 — Real supplement hero input (32714)

## Script

**`backend/scripts/p106-real-supplement-hero-live-32714.ts`**

### Required input (exactly one)

| Flag | Persisted field | Notes |
|------|-----------------|--------|
| **`--url <https://...>`** | `productData.mlImagePipeline.portadaSupplementHeroUrl` | **HTTPS only.** Source is probed with `processFromUrlSafe` before any `productData` write; unfetchable → exit **3**, `p106_hero_url_unfetchable_or_empty`. |
| **`--workspace-path <path>`** | `productData.mlImagePipeline.portadaSupplementHeroWorkspaceRelativePath` | Absolute or cwd-relative. Extensions: `.png`, `.jpg`, `.jpeg`, `.webp`. If path is **outside** repo root, file is copied to **`artifacts/ml-image-packs/product-32714/p106_supplement_hero.<ext>`** and that **repo-relative** path is persisted. |

The other supplement field is cleared (`null` / removed from JSON) when merging.

### Optional

- **`--dry-run`** — skip `prisma.product.update` (metadata merge still computed in memory for rebuild).
- **`--try-replace-ml <ITEM_ID>`** — after a **successful** rebuild, call picture replace with `[cover_main, detail_mount_interface]`.

### Explicitly excluded (P106)

- **No** `--seed-from-pack-detail` / detail clone — use **P105** only if that path is intentionally required.

## This run (automated agent, no hero supplied)

Command: `npx tsx scripts/p106-real-supplement-hero-live-32714.ts` (no flags).

- **`fatalError`:** `p106_real_supplement_hero_missing`
- **Artifact:** repo-root **`p106-live-result.json`**
- **DB:** not updated (script exits before `findUnique`).

## Operator command (when a real hero exists)

```text
cd backend
npx tsx scripts/p106-real-supplement-hero-live-32714.ts --url https://<your-clean-hero> --try-replace-ml MLC3805190796
```

or

```text
npx tsx scripts/p106-real-supplement-hero-live-32714.ts --workspace-path "<path-to-clean-hero.png>" --try-replace-ml MLC3805190796
```
