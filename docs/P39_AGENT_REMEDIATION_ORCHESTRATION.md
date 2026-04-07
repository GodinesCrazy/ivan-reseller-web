# P39 Agent Remediation Orchestration

Date: 2026-03-23

## Goal

Formalize the internal remediation stage as a reusable product orchestration step.

## Invocation Rule

The remediation agent stage is invoked when:

- raw ML image audit does not safely pass as-is

## Inputs

- `productId`
- `title`
- raw image URLs
- raw audit result
- canonical asset slots

## Returned Artifacts

- remediation decision
- remediation path selected
- canonical pack directory
- prompt/spec files
- manifest with asset states
- reviewed-proof draft metadata

## Validation After Agent Stage

The software re-checks:

- required asset file presence
- square-like geometry
- minimum `1200x1200`
- approved asset states

Only then may publish continue.

## Partial Success / Failure Rules

### Partial success

- manifest and prompt package created
- asset files still missing

State:

- publish blocked
- pack pending generation

### Full success

- required files exist
- required files pass dimensions
- required files are approved in manifest

State:

- publish-safe

### Failure

- no source images
- remediation path cannot produce compliant pack

State:

- publish blocked honestly

