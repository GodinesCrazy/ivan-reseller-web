# P44 Self-Hosted Provider Strategy

## Selected Strategy

- Preferred self-hosted path: open-source image backend exposed through an `AUTOMATIC1111` / `Stable Diffusion WebUI` compatible `txt2img` HTTP API.
- Intended model family: `FLUX` or `SDXL` running behind that compatible endpoint.

## Why This Strategy Fits

- It can generate clean square product hero images and supporting gallery assets from the existing prompt/spec contract.
- It supports local or privately hosted operation.
- It reduces dependence on per-call paid image APIs.
- It fits the current remediation pipeline because the native executor already works from prompt manifests and writes into the canonical asset-pack directory.

## Provider Order

1. `OpenAI` if healthy
2. `Gemini` if healthy
3. `self_hosted`
4. `Groq` advisory/text-only support

## P44 Outcome

- The provider order above is now implemented in the native executor.
- The live environment for this sprint still reports `self_hosted_unavailable`, so the path is integrated but not yet activated.
