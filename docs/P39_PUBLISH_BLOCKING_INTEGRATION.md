# P39 Publish Blocking Integration

Date: 2026-03-23

## Goal

Make the real ML publish path depend on the compliant asset pack contract instead of risky supplier images.

## Implemented Integration

### Pre-publish validator

`prepareProductForSafePublishing` now invokes:

- `runMercadoLibreImageRemediationPipeline`

Behavior:

- if `publishSafe = false` -> strict publish fails
- if compliant pack exists -> strict publish may continue
- metadata patch now includes remediation + asset-pack state

### MercadoLibre publisher

`MercadoLibrePublisher.publishProduct` now invokes:

- `resolveMercadoLibrePublishImageInputs`

Behavior:

- if remediation pipeline does not return publish-safe images -> publish fails honestly
- if compliant pack exists -> publisher sends those asset inputs to MercadoLibre

### MercadoLibre image upload service

`MercadoLibreService.uploadImage` now accepts:

- remote URLs
- local file paths

This is critical because the internal compliant asset pack can now live on disk and still be uploaded by the real ML publish path.

## Publish Rule

- compliant approved pack exists -> publish may continue
- raw images are safely pass-through -> publish may continue
- remediation pending / pack missing -> publish blocked
- remediation failed -> publish blocked

