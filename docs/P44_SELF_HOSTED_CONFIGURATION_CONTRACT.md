# P44 Self-Hosted Configuration Contract

## Required Activation Surface

- `SELF_HOSTED_IMAGE_PROVIDER_ENABLED=true`
- `SELF_HOSTED_IMAGE_PROVIDER_BASE_URL=<http(s) endpoint>`

## Supported Mode In P44

- `SELF_HOSTED_IMAGE_PROVIDER_MODE=automatic1111`

## Optional Runtime Controls

- `SELF_HOSTED_IMAGE_PROVIDER_API_KEY`
- `SELF_HOSTED_IMAGE_PROVIDER_MODEL`
- `SELF_HOSTED_IMAGE_PROVIDER_NEGATIVE_PROMPT`
- `SELF_HOSTED_IMAGE_PROVIDER_SAMPLER`
- `SELF_HOSTED_IMAGE_PROVIDER_STEPS`
- `SELF_HOSTED_IMAGE_PROVIDER_CFG_SCALE`
- `SELF_HOSTED_IMAGE_PROVIDER_WIDTH`
- `SELF_HOSTED_IMAGE_PROVIDER_HEIGHT`
- `SELF_HOSTED_IMAGE_PROVIDER_TIMEOUT_MS`

## Output Expectations

- generated files must be written into:
  - `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-<productId>`
- canonical names remain:
  - `cover_main.png`
  - `detail_mount_interface.png`
  - `usage_context_clean.png` optional

## Activation Contract

- if enabled with missing base URL: `self_hosted_misconfigured`
- if not enabled and no base URL: `self_hosted_unavailable`
- if enabled and endpoint responds: provider can enter `self_hosted_available`
