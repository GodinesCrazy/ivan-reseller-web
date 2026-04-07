# P40 Internal Image Executor Design

## Goal
Implement the missing native execution stage for the MercadoLibre image remediation pipeline so the software can turn a remediation manifest into real publication-ready assets.

## Pipeline Stage
`ml-asset-pack.json` + prompt files -> internal image executor -> generated asset files -> automated review -> manifest update -> publish-safe handoff or honest block

## Inputs
- `productId`
- `userId`
- canonical pack dir: `artifacts/ml-image-packs/product-<productId>`
- `ml-asset-pack.json`
- `cover_main.prompt.txt`
- `detail_mount_interface.prompt.txt`
- `usage_context_clean.prompt.txt` optional
- OpenAI production credential entry or env fallback

## Outputs
- `cover_main.png`
- `detail_mount_interface.png`
- `usage_context_clean.png` optional
- manifest asset status updates
- executor run result with provider, counts, per-asset notes, and blocking reasons

## Invocation Rules
- Invoke only when remediation decision selects `internal_generated_asset_pack`
- Invoke only when `userId` is available
- Keep publish fail-closed if generation or review fails

## Success State
- required assets exist
- required assets pass automated review
- manifest marks required assets `approved`
- `reviewedProofState=files_ready_pending_manual_upload`

## Failure States
- `manifest_missing`
- `provider_unavailable`
- provider request failure
- generated but review rejected
- required assets still absent
