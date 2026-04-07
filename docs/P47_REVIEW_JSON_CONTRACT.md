# P47 Review JSON Contract

## Path

- `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\ml-asset-visual-review.json`

## Required Structure

Top-level fields:

- `schemaVersion`
- `productId`
- `listingId`
- `reviewedAt`
- `reviewedBy`
- `reviewMethod`
- `notes`
- `assets`

Per required asset:

- `assetKey`
- `reviewedAt`
- `reviewedBy`
- `reviewMethod`
- `notes`
- `checklist`

Per-asset checklist booleans:

- `product_complete`
- `centered_or_compositionally_clear`
- `product_protagonist`
- `no_text`
- `no_watermark_logo`
- `no_hand`
- `no_collage_split`
- `visually_cleaner_than_supplier`

## Native Compatibility

- the current native approval stage consumes the boolean checklist contract per asset
- extra fields such as `reviewMethod` and `notes` are preserved as audit evidence
