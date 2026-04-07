# P39 Automatic Remediation Strategy

Date: 2026-03-23

## Goal

Implement a native internal remediation strategy for risky MercadoLibre publication images.

## Implemented Strategy

### Path 1 — `internal_process_existing_images`

Used when:

- raw blockers are limited to size / square normalization
- there are enough source images

What the software does:

- downloads source images
- square-fits them on a white background
- normalizes them
- writes canonical pack files
- marks them as internally processed assets

### Path 2 — `internal_generated_asset_pack`

Used when:

- supplier raw images are risky
- raw pack is single-image
- raw cover cannot be trusted as final ML cover
- hard visual remediation or regeneration is required

What the software does today:

- creates canonical pack directory
- creates `ml-asset-pack.json`
- creates `cover_main.prompt.txt`
- creates `detail_mount_interface.prompt.txt`
- creates `usage_context_clean.prompt.txt`
- records remediation path and pending asset states

What is still missing for full end-to-end automation:

- a trusted internal image-generation / regeneration backend that returns the final compliant image files automatically

## Native Capability Outcome

P39 achieved outcome `B`:

- the remediation stage is now internal, agentized, integrated, testable, and publish-blocking until pass

