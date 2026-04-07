# P41 Rerun Executor For 32690

## Command
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`

## Result
- `decision=auto_remediate`
- `remediationPathSelected=internal_generated_asset_pack`
- `executor.status=failed`
- `executor.providerName=gemini`
- `generatedCount=0`
- `approvedCount=0`

## Attempted Providers
1. `openai`
   - source: `env:OPENAI_API_KEY`
   - status: `failed`
   - blocker: `http_400:Billing hard limit has been reached.`
2. `gemini`
   - source: `env:GEMINI_API_KEY`
   - status: `failed`
   - blocker: `http_400:API key not valid. Please pass a valid API key.`
