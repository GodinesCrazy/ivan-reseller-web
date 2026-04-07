# P44 Self-Hosted Executor Integration Design

## Contract

The self-hosted provider plugs into the existing native executor using the same canonical asset-pack contract:

- `cover_main`
- `detail_mount_interface`
- `usage_context_clean` optional

## Inputs

- `ml-asset-pack.json`
- `cover_main.prompt.txt`
- `detail_mount_interface.prompt.txt`
- `usage_context_clean.prompt.txt` when present
- self-hosted env configuration

## Outputs

- generated image files in `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-<productId>`
- manifest updates with filename, notes, generation timestamps, `generatedByAgent`, approval state, and reviewed-proof state

## Request Format

- mode: `automatic1111`
- endpoint: `POST <SELF_HOSTED_IMAGE_PROVIDER_BASE_URL>/sdapi/v1/txt2img`
- request carries prompt, negative prompt, width, height, steps, cfg scale, sampler, and one-image generation settings

## Fail / Retry States

- `self_hosted_unavailable`
- `self_hosted_misconfigured`
- `self_hosted_generation_failed`
- retry remains safe because the executor writes into the same manifest/pack location

## Review Behavior

- default review is fail-closed
- generated files can exist while remaining `present_unapproved`
- publication still stops unless approved pack requirements are fully met
