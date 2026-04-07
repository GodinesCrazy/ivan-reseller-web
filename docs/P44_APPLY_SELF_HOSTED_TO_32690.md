# P44 Apply Self-Hosted To 32690

## Product / Listing

- `productId=32690`
- `listingId=MLC3786354420`

## Live Rerun

Command:

- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`

Observed result:

- `decision=auto_remediate`
- `remediationPathSelected=internal_generated_asset_pack`
- `providerAudit.primaryProviderState=provider_available_billing_blocked`
- `providerAudit.fallbackProviderState=fallback_provider_available`
- `providerAudit.tertiaryProvider=self_hosted`
- `providerAudit.tertiaryProviderState=self_hosted_unavailable`
- `providerAudit.notes` includes `self_hosted_provider_not_enabled`

Provider attempts in this sprint:

- `openai` attempted and failed with `http_400:Billing hard limit has been reached.`
- `gemini` attempted and failed with `http_400:API key not valid. Please pass a valid API key.`
- `self_hosted` did not run because it was unavailable, not because the executor lacked support

Pack state stayed blocked:

- `generatedCount=0`
- `approvedCount=0`
- `cover_main` missing
- `detail_mount_interface` missing
