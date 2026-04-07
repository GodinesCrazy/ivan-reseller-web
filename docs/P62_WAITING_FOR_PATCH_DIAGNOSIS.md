# P62 — Waiting-for-patch diagnosis

**Scope:** Product `32690`, listing `MLC3786354420` only.  
**Evidence time (pre-recovery):** `2026-03-24T22:11:22.793Z` (`p50` JSON `generatedAt`).

## Live MercadoLibre state (pre-recovery)

| Field | Value |
|--------|--------|
| `liveItem.status` | `under_review` |
| `liveItem.sub_status` | `["waiting_for_patch"]` |
| `liveItem.health` | `null` (no extra health payload in our `getItem` snapshot) |
| `liveItem.permalink` | `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM` |

### Picture IDs on the live item (pre-recovery)

1. `614677-MLC109297138823_032026` — `max_size` `1200x1200`
2. `706701-MLC108496629126_032026` — `max_size` `1156x1200`

## Approved asset pack (product 32690)

Source: `artifacts/ml-image-packs/product-32690/ml-asset-pack.json`.

- **Required approved:** `cover_main`, `detail_mount_interface` (`approvalState: approved`).
- **Optional unapproved:** `usage_context_clean` (`present_unapproved`) — correctly **not** used by `p49` upload order.

`check-ml-asset-pack-readiness.ts 32690` reported: `ready: true`, `packApproved: true`, no missing/invalid/unapproved required assets.

## Comparison: live vs pack

- Remote picture **IDs and CDN URLs** did **not** match the outcome of a successful reapplication of the current approved pack (pre-recovery IDs were the older pair above).
- MercadoLibre’s public item API path used by the monitor exposes `status`, `sub_status`, `permalink`, `pictures`; it does **not** return a free-text moderation reason in our typed snapshot.
- **Most likely cause (evidence-backed):** ML was in **`waiting_for_patch`** pending seller-side correction of listing **pictures** (stale or non-compliant imagery relative to what ML expected after prior review cycles). This is **not** classified as “local/remote drift only” as the **root** cause: the marketplace item was genuinely `under_review`.
- **Less likely as sole explanation:** pure moderation queue delay without a patch requirement — the same sprint applied picture replacement and the item moved to **`active`** with empty `sub_status` immediately after (see `P62_TARGETED_RECOVERY_EXECUTION.md`), which indicates an actionable patch was accepted rather than an indefinite wait.

## Local DB snapshot (pre-recovery, for context)

From the same `p50` run:

- `product.status`: `APPROVED`, `isPublished`: `false`
- `listing.status`: `failed_publish`

This was **operational drift** vs live ML (live was under review, not “failed” in ML terms). Recovery execution aligned local rows after a successful replace (see alignment doc).

## Classification label

**Primary:** `ml_waiting_for_patch_due_listing_images` (actionable picture patch; confirmed by post-replace transition to `active` / `sub_status: []` in `P62_TARGETED_RECOVERY_EXECUTION.md`).

**Secondary note:** `permalinkHeadStatus: 403` from `p50` is an HTTP probe artifact and is **not** used here as proof of listing state; API `status`/`sub_status` are the authority for sellability in this runbook.
