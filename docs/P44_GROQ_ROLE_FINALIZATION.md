# P44 Groq Role Finalization

## Final Role

- `Groq = advisory_only`
- `Groq = optimization-agent support`
- `Groq = prompt/spec generation support`

## Explicit Non-Role

- Groq is **not** the primary image-generation provider for MercadoLibre asset files in P44.
- Groq is **not** used to satisfy `cover_main` / `detail_mount_interface` generation requirements.

## Durable Provider Order

1. `OpenAI`
2. `Gemini`
3. `self_hosted`
4. `Groq advisory/text-only`
