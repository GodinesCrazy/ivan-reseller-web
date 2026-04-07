# P42 Executor Rerun For 32690

Product context:

- `productId=32690`
- `listingId=MLC3786354420`

Rerun outcome:

- `decision=auto_remediate`
- `remediationPathSelected=internal_generated_asset_pack`
- `executor.status=failed`
- `provider used on final executor state=gemini`
- `attemptedProviders=[openai, gemini]`
- `generatedCount=0`
- `approvedCount=0`

Per-provider blocking reasons:

- `openai`
  - `cover_main:http_400:Billing hard limit has been reached.`
  - `detail_mount_interface:http_400:Billing hard limit has been reached.`
- `gemini`
  - `cover_main:http_400:API key not valid. Please pass a valid API key.`
  - `detail_mount_interface:http_400:API key not valid. Please pass a valid API key.`

Per-asset result:

- `cover_main`: not generated
- `detail_mount_interface`: not generated
- `usage_context_clean`: not generated
