# P25 ML Chile Pause State Confirmation

## Current Business State
- `paused_on_external_freight_dependency`
- `freight_platform_entitlement_required`
- `ready_after_external_freight_fix`

## Meaning
The business should read ML Chile as:
- paused for a narrow external reason
- not broken end-to-end upstream
- immediately resumable once the freight-capable app/session path is repaired

## What Must Stay True
- no fake “near progress” reporting while freight is blocked
- no further category/seller iteration as a substitute for the external fix
- no strict funnel promotion before real freight truth exists
