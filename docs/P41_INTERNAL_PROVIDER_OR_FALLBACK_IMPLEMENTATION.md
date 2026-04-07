# P41 Internal Provider Or Fallback Implementation

## Objective
Recover a working internal generation path without breaking the native remediation architecture.

## Implemented In P41
- `backend/src/services/mercadolibre-image-executor.service.ts` now supports:
  - provider abstraction
  - primary + fallback candidate resolution
  - sequential provider attempts
  - provider attempt telemetry
  - provider recovery audit
- `backend/src/types/api-credentials.types.ts` now includes:
  - richer `OpenAICredentials`
  - `GeminiCredentials`
- `backend/src/services/credentials-manager.service.ts` now supports:
  - `openai` base/model/image/review env fields
  - `gemini` env fallback and validation
- `backend/env.local.example` now exposes the image-provider env surface

## Supported Internal Paths
- `openai` as primary provider
- `gemini` as first-class internal fallback provider

## Executor Contract Preserved
- canonical pack directory unchanged:
  - `artifacts/ml-image-packs/product-<productId>`
- canonical pack assets unchanged:
  - `cover_main`
  - `detail_mount_interface`
  - `usage_context_clean`
