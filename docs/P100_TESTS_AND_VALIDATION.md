# P100 — Tests and validation

## TypeScript

```bash
cd backend
npm run type-check
```

**Result:** `tsc --noEmit` **passed** after P100 changes.

## Focused Jest

```bash
cd backend
npx jest src/services/__tests__/ml-portada-visual-compliance.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts --runInBand
```

**Result:** **all tests passed** (portada gate + remediation pack inspection, including approved pack with gate pass on synthetic clean square).

## Runtime / ML API (controlled script)

```bash
cd backend
npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts
```

**Result in this environment:** Script wrote **compliant local pack** and **`p100-portada-hotfix-result.json`**, but **`replaceListingPictures` failed** with **`409`** / ML message that the item **`inactive`** cannot be updated via API until seller-center resolution (see `P100_ML_LISTING_IMAGE_UPDATE.md`).
