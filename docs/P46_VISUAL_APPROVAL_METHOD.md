# P46 Visual Approval Method

## Native Approval Method

- Method selected: `hybrid_structural_plus_review_confirmation`

## What It Does

1. automated structural checks
   - required file exists
   - dimensions available
   - `minimum_1200x1200`
   - square-like framing remains enforced by the existing pack inspection
2. explicit native review-confirmation step
   - expected file: `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\ml-asset-visual-review.json`
   - required checklist confirmation per required asset:
     - `product_complete`
     - `centered_or_compositionally_clear`
     - `product_protagonist`
     - `no_text`
     - `no_watermark_logo`
     - `no_hand`
     - `no_collage_split`
     - `visually_cleaner_than_supplier`

## Why This Method Was Chosen

- automatic structural checks alone are not trustworthy enough to approve MercadoLibre-safe visual quality
- the fail-closed gate is preserved
- the software now has a native way to record honest pass/fail review evidence instead of skipping approval or inventing certainty

## P46 Result

- native approval stage implemented in:
  - `backend/src/services/mercadolibre-asset-approval.service.ts`
  - `backend/scripts/check-ml-asset-visual-approval.ts`
- without review confirmation, assets remain `still_manual_review_required`
