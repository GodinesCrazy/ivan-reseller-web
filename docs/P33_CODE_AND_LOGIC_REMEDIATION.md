# P33 Code And Logic Remediation

Date: 2026-03-23

## Goal

Add a fail-closed MercadoLibre Chile image-policy gate so the publication problem does not repeat.

## Implemented changes

### 1. New image-policy audit service

Added:

- `backend/src/services/mercadolibre-image-policy.service.ts`

This service now:

- defines statuses:
  - `ml_image_policy_pass`
  - `ml_image_policy_fail`
  - `ml_image_manual_review_required`
- inspects the first marketplace images
- measures image metadata when possible
- classifies supplier-raw image risk
- supports reviewed-proof metadata for manually approved replacement assets

### 2. Strict pre-publish gate

Updated:

- `backend/src/services/pre-publish-validator.service.ts`

MercadoLibre publish preparation now:

- audits image policy before publication
- hard-fails on ML image-policy fail states
- hard-fails on ML manual-review-required states
- persists the audit in `preventivePublish.mlChileImageCompliance` on successful pass
- ties `policyComplianceReady` to real ML image-policy pass state

### 3. Dedicated diagnostic

Added:

- `backend/scripts/check-ml-image-compliance.ts`

This script audits one product and prints the exact ML image-policy state.

## Tests added

Added:

- `backend/src/services/__tests__/mercadolibre-image-policy.service.test.ts`

Covered cases:

- text / logo / watermark rejection
- incomplete / uncentered product rejection via explicit visual signal
- primary image below minimum size rejection
- manual review fallback for single supplier-raw cover images

## Commands executed

```text
backend npm run type-check
backend npx jest src/services/__tests__/mercadolibre-image-policy.service.test.ts --runInBand
backend npx tsx scripts/check-ml-image-compliance.ts 32690
```

## Exact results

`npm run type-check`

- passed

`jest src/services/__tests__/mercadolibre-image-policy.service.test.ts --runInBand`

- passed `4/4`

`npx tsx scripts/check-ml-image-compliance.ts 32690`

- `status = ml_image_manual_review_required`
- `manualReviewReasons = supplier_raw_images_require_reviewed_ml_cover, single_cover_image_requires_manual_review`
- `qualityRequirements = single_image_gallery`

## P33 code conclusion

Future MercadoLibre Chile publish attempts no longer rely on image ordering heuristics alone.

They now fail closed when ML image compliance is unsafe or unproven.

