# P108 — Product 32714 advanced benchmark

## Command

```text
cd backend
npx tsx scripts/p108-automatic-portada-benchmark-32714.ts
```

## Method

- Supplier **7** URLs from DB; supplement hero fields stripped **in memory**.
- **`advancedRecovery: true`** (five waves).
- **`multiRecipe: true`** (six P107 recipes).

## Artifact

**`p108-benchmark-32714.json`**

## Result (2026-03-27)

| Field | Value |
|--------|--------|
| `p103Ok` | `false` |
| `automaticPortadaClassification` | `AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED` |
| `recoveryProfilesAttempted` | 5 profiles (`p108_none` … `p108_alpha_dilate1_feather`) |
| `coverSha256` | `null` |

**Dominant signals** (see `dominantStrictNaturalSignalsAcrossAllVariants`): harsh silhouette/sticker risk and white-field dominance lead; collage/seam risks remain significant.

## Conclusion

Even with **P108 alpha recovery + full P107 recipe grid**, no compliant automatic portada was produced for **32714** from supplier-only inputs. The run **fails closed** with **`AUTOMATIC_ADVANCED_RECOVERY_EXHAUSTED`** (distinct from P107’s `IMAGE_SOURCE_INSUFFICIENT_FOR_MARKETPLACE` when recovery was not applied).
