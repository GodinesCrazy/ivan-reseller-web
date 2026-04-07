# P63 — Stability verification

## Commands

```text
cd backend
npm run type-check
npx tsx scripts/p50-monitor-ml-controlled-sale.ts 1 32690 MLC3786354420
```

(Type-check: **exit 0**. Monitor re-run after `p49` and after `p50` public-probe enhancement.)

## API stability (authenticated `getItem`)

**Snapshot `generatedAt`:** `2026-03-24T22:56:18.586Z`

| Field | Value |
|--------|--------|
| `liveItem.status` | `active` |
| `liveItem.sub_status` | `[]` |
| `liveItem.permalink` | `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM` |
| Pictures | `777356-MLC109380855063_032026`, `984076-MLC108575468668_032026` |

**Verdict:** **`stable_and_sellable`** at the **MercadoLibre seller API** layer (active, no `sub_status` flags in snapshot).

## Public-facing stability (automation)

| Probe | Result |
|--------|--------|
| `permalinkHeadStatus` | **403** |
| `permalinkPublicProbe.getStatus` | **200** |
| `permalinkPublicProbe.challengeShellDetected` | **true** |
| `permalinkPublicProbe.bodyByteLengthApprox` | **2433** |
| `permalinkPublicProbe.matchedErrorHints` | `[]` |
| `permalinkPublicProbe.publicSurfaceClassification` | `ambiguous` (challenge shell; not PDP HTML) |

**Verdict:** Automation **does not** receive a product page; it receives a **JS/bot challenge**. Therefore **rendered buyer PDP was not verified** by repo scripts alone.

### Mapping to sprint taxonomy

- **`api_active_but_public_unstable`** fits **only if** “public unstable” means *“simple HTTP cannot confirm PDP”* — **not** *“buyers necessarily see an error.”*
- Not **`under_review` / `waiting_for_patch` / blocked`** at verification time (API).

**Combined operational verdict:** **`api_stable_public_render_not_automation_verified`**

## Oscillation risk

The listing **had returned** to `waiting_for_patch` before this sprint’s `p49`. Continued monitoring is required; see `P63_EXECUTION_REPORT.md`.
