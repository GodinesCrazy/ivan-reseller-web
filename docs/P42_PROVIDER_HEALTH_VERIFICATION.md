# P42 Provider Health Verification

Commands run:

- `backend npm run type-check`
- `backend npx tsx scripts/check-ml-image-remediation.ts 32690 --persist`
- `backend npx tsx scripts/check-ml-asset-pack-readiness.ts 32690`

Observed results:

- Type-check: `PASS`
- OpenAI provider source after injection: `env:OPENAI_API_KEY`
- OpenAI provider state after injection: `provider_available_billing_blocked`
- OpenAI exact runtime blocker: `http_400:Billing hard limit has been reached.`
- Gemini fallback source: `env:GEMINI_API_KEY`
- Gemini fallback state at rerun time: operationally unusable
- Gemini exact runtime blocker: `http_400:API key not valid. Please pass a valid API key.`

Conclusion:

- The recovered OpenAI env path is now present and selected, but it did not become usable.
- The provider problem moved from `missing or wrong env` to `valid env path present but billing-blocked`.
