# P34 Future Listing Prevention Check

Date: 2026-03-23

## Goal

Verify that the new MercadoLibre image-policy gate remains fail-closed.

## Commands executed

```text
backend npm run type-check
backend npx jest src/services/__tests__/mercadolibre-image-policy.service.test.ts --runInBand
backend npx tsx scripts/check-ml-image-compliance.ts 32690
```

## Exact results

`npm run type-check`

- passed

`npx jest src/services/__tests__/mercadolibre-image-policy.service.test.ts --runInBand`

- passed `4/4`

Covered test cases:

- rejects text / logo / watermark signals
- rejects incomplete / uncentered product signals
- rejects primary image below `1200x1200`
- requires manual review for single supplier-raw cover images

`npx tsx scripts/check-ml-image-compliance.ts 32690`

- `status = ml_image_manual_review_required`
- `manualReviewReasons = supplier_raw_images_require_reviewed_ml_cover, single_cover_image_requires_manual_review`
- `qualityRequirements = single_image_gallery`
- `storedProof = null`

## Prevention conclusions

### 1. Fail-closed behavior

Verified.

The new gate does not silently pass the current risky supplier cover.

### 2. Single supplier-raw cover

Verified.

A single supplier-raw cover still triggers:

- `supplier_raw_images_require_reviewed_ml_cover`
- `single_cover_image_requires_manual_review`

### 3. Reviewed-proof dependency

Verified.

The current asset cannot pass because:

- `storedProof = null`
- no approved replacement cover URL has been recorded

## P34 prevention conclusion

The recurrence path is closed at code level.

The remaining blocker is asset production and operator approval, not silent future republishing.

