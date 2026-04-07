# P40 Internal Image Executor Implementation

## Implemented Components
- New service: `backend/src/services/mercadolibre-image-executor.service.ts`
- OpenAI env fallback in `backend/src/services/credentials-manager.service.ts`
- Remediation integration in `backend/src/services/mercadolibre-image-remediation.service.ts`
- Live path propagation through:
  - `backend/src/services/pre-publish-validator.service.ts`
  - `backend/src/modules/marketplace/mercadolibre.publisher.ts`
  - `backend/scripts/check-ml-image-remediation.ts`

## Native Behavior
- Reads canonical manifest and prompt files
- Resolves OpenAI provider credentials
- Calls image generation
- Saves generated assets into the canonical pack dir
- Runs automated review
- Updates manifest approval state and reviewed-proof readiness
- Returns executor telemetry in the remediation result

## Hardening Added During P40
- removed invalid OpenAI image parameter `response_format`
- aligned requested image size to a provider-supported value
- surfaced exact provider-side error messages into asset notes and executor blocking reasons

## Current Live Limitation
- live request shape is now correct
- current live block is provider billing capacity:
  - `http_400:Billing hard limit has been reached.`
