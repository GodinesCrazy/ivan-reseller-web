# P40 Apply Executor To 32690

## Target
- `productId=32690`
- `listingId=MLC3786354420`

## Raw Audit Truth
- raw image status: `ml_image_manual_review_required`
- decision: `auto_remediate`
- remediation path: `internal_generated_asset_pack`

## Live Executor Result
- provider available: `true`
- provider name: `openai`
- model: `gpt-image-1`
- review model: `gpt-4o-mini`
- generated count: `0`
- approved count: `0`
- required files produced: `false`

## Exact Live Blocker Sequence
1. `http_400:Unknown parameter: 'response_format'.`
2. `http_400:Invalid value: '1536x1536'. Supported values are: '1024x1024', '1024x1536', '1536x1024', and 'auto'.`
3. final live blocker after code fixes:
   - `http_400:Billing hard limit has been reached.`

## Current Classification
- `remediation_failed` for live generation
- listing is not yet ready for asset replacement because required files do not exist
