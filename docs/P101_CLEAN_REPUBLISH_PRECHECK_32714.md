# P101 — Clean republish precheck (product 32714)

## Scope

- Product **32714** only. Old Mercado Libre listing **MLC3804135582** treated as obsolete (operator-deleted / inactive).

## Section 1 — Pre-publish image identity

| Asset | Absolute path | Bytes | SHA-256 |
|-------|-----------------|-------|---------|
| Portada (`cover_main`) | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\cover_main.png` | 796094 | `f0514738a2085f297fbd95eade925442cc8388e622953243ce991aa29fa21122` |
| Detail (`detail_mount_interface`) | `C:\Ivan_Reseller_Web\artifacts\ml-image-packs\product-32714\detail_mount_interface.png` | 1450729 | `7c0197a5c00fb5b607f365c528da248e02dd2eef57de253014f70adc1a667c13` |

- **Manifest:** `artifacts/ml-image-packs/product-32714/ml-asset-pack.json`
- **`cover_main.assetSource`:** `p100_supplier_clean_square_portada_gate` (P101 fail-closed mark `p100` satisfied).
- **Build notes (P100):** `recipe=extra`, `keep=0.55`, `vTop=0.5`, `hNudge=0.028`; local **portada strict gate** passed (see `p101-republish-result.json` → `portadaStrictGate`).
- **Picture order for Mercado Libre:** position `0` = `cover_main.png` (portada), position `1` = `detail_mount_interface.png`.

## Section 2 — Preflight recheck (at publish time)

Captured in `p101-republish-result.json` under `preflightRecheck`:

| Field | Value |
|-------|--------|
| `overallState` | `ready_to_publish` |
| `publishAllowed` | `true` |
| `blockers` | `[]` |
| `images.packApproved` | `true` |
| `images.publishSafe` | `true` |
| `listingSalePriceUsd` | `12` |
| ML connection | `testConnectionOk: true`, production credentials |

**Note:** First P101 attempt failed preflight while product status was `APPROVED` (required `VALIDATED_READY`). Status was aligned with script `backend/scripts/p101-set-validated-ready-32714.ts` before the successful run.

## Operational prerequisites executed before successful publish

1. `npx tsx scripts/p98-build-ml-pack-32714.ts` — ensured `detail_mount_interface.png` (and base pack) on disk.
2. `npx tsx scripts/p100-hotfix-32714-portada-ml-listing.ts --build-only` — rebuilt `cover_main.png` through hardened search (extra/mild/standard recipes, vertical crop bias, horizontal nudge).
3. `npx tsx scripts/p101-set-validated-ready-32714.ts` — workflow gate for preflight.
