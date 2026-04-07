# P100 — Portada guardrail tests

## Suite

**File:** `backend/src/services/__tests__/ml-portada-visual-compliance.service.test.ts`

## Cases

| Test | Expectation |
| --- | --- |
| Uniform light square | **Pass** — baseline clean catalog field. |
| Buffer vs file path | Same **`pass`** / **`signals`** for identical pixels (`evaluateMlPortadaStrictGateFromBuffer` vs `evaluateMlPortadaStrictGate`). |
| Strong top black strip | **Fail** — banner / text-bar risk. |
| Wide left dark sidebar | **Fail** — sidebar promo / collage edge. |
| Dense SVG text lines in top | **Fail** — horizontal stroke density (text-like). |
| Two-panel vertical split | **Fail** — collage seam / multi-panel. |
| SVG UI chrome + line grid | **Fail** — screenshot-like framing. |
| Moderate gray top strip | **Fail** — **uncertainty / soft band** fail-closed. |

## Related regression

**File:** `backend/src/services/__tests__/mercadolibre-image-remediation.service.test.ts` — still passes; validates **`inspectMercadoLibreAssetPack`** + pipeline wiring with **`cover_main`** gate on synthetic approved pack.

## Commands

```bash
cd backend
npm run type-check
npx jest src/services/__tests__/ml-portada-visual-compliance.service.test.ts src/services/__tests__/mercadolibre-image-remediation.service.test.ts --runInBand
```
