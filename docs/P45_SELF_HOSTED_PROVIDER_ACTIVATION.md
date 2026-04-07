# P45 Self-Hosted Provider Activation

## Activation Surface

- `SELF_HOSTED_IMAGE_PROVIDER_ENABLED=true`
- `SELF_HOSTED_IMAGE_PROVIDER_BASE_URL=http://127.0.0.1:7860`
- `SELF_HOSTED_IMAGE_PROVIDER_MODE=automatic1111`
- `SELF_HOSTED_IMAGE_PROVIDER_MODEL=local_prompt_to_source_transform`
- `SELF_HOSTED_IMAGE_PROVIDER_TIMEOUT_MS=180000`

## Activation Method

- Local activation persisted in `backend/.env`
- Local endpoint started from:
  - `backend/scripts/run-self-hosted-image-provider.ts`

## Endpoint Health

- `GET http://127.0.0.1:7860/health` -> `200`
- response:
  - `status=ok`
  - `provider=self_hosted_automatic1111_compat`
  - `mode=automatic1111`
  - `generatedFrom=prompt_to_source_transform`

## P45 Result

- self-hosted provider path is now operationally enabled on the local workstation environment used by the remediation scripts.
