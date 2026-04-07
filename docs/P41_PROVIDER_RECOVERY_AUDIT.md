# P41 Provider Recovery Audit

## Goal
Audit the native internal image-generation provider path and identify the most direct recovery route for the ML image executor.

## Current Native Provider Order
1. `openai` primary
2. `gemini` fallback

## Runtime Truth For Product 32690
- `productId=32690`
- `userId=1`
- executor recovery route now resolves as `openai -> gemini`

## Credential Integrity Audit
- `openai` integrity report:
  - `source=user`
  - `state=missing`
  - `reasonCode=inactive`
  - `recordId=275`
- `gemini` integrity report:
  - `source=user`
  - `state=parse_failed`
  - `reasonCode=invalid_plaintext_payload`
  - `recordId=333`

## Env Presence Audit
- `OPENAI_API_KEY_present=true`
- `GEMINI_API_KEY_present=true`
- `OPENAI_BASE_URL_present=false`

## Live Provider State
- primary provider state:
  - `provider_available_billing_blocked`
  - source label: `env:OPENAI_API_KEY`
  - live blocker: `http_400:Billing hard limit has been reached.`
- fallback provider state:
  - `fallback_provider_available`
  - source label: `env:GEMINI_API_KEY`
  - live blocker: `http_400:API key not valid. Please pass a valid API key.`
