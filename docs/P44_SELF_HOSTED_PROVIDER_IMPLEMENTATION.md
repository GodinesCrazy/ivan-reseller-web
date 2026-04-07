# P44 Self-Hosted Provider Implementation

## New Native Provider Path

- Added native adapter: `backend/src/services/self-hosted-image-provider.service.ts`
- Integrated into executor priority chain: `backend/src/services/mercadolibre-image-executor.service.ts`

## New Provider States

- `self_hosted_available`
- `self_hosted_unavailable`
- `self_hosted_misconfigured`
- `self_hosted_generation_failed`

## Implementation Notes

- The executor now supports provider name `self_hosted`
- The provider audit now exposes:
  - `tertiaryProvider`
  - `tertiaryProviderSource`
  - `tertiaryProviderState`
- Self-hosted generation uses the same canonical prompt pack and output directory as OpenAI/Gemini
- Default review strategy is fail-closed, so generated files are not auto-approved without explicit review success

## Live P44 State

- Implementation is complete
- Activation is still pending because no live self-hosted endpoint/config was available in this environment
