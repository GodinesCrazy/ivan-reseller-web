# P45 Self-Hosted Rerun For 32690

## Commands

- `backend npm run type-check`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`

## Live Result

- `decision=auto_remediate`
- `remediationPathSelected=internal_generated_asset_pack`
- `executor.status=partial`
- `executor.providerName=self_hosted`
- `generatedCount=3`
- `approvedCount=0`

## Attempt Chain

- `openai` failed with `http_400:Billing hard limit has been reached.`
- `gemini` failed with `http_400:API key not valid. Please pass a valid API key.`
- `self_hosted` generated the asset files successfully but left them unapproved

## Per-Asset Result

- `cover_main`
  - generated: `true`
  - path: `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\cover_main.png`
  - approvalState: `present_unapproved`
- `detail_mount_interface`
  - generated: `true`
  - path: `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\detail_mount_interface.png`
  - approvalState: `present_unapproved`
- `usage_context_clean`
  - generated: `true`
  - path: `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32690\usage_context_clean.png`
  - approvalState: `present_unapproved`

## Exact Current Blocker

- `self_hosted_review_strategy=fail_closed_pending_review`
- `self_hosted_generated_asset_requires_visual_review_confirmation`
