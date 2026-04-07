# P63 — Dual-truth audit (API vs public)

**Listing:** `MLC3786354420` — **Product:** `32690`

## A) MercadoLibre API truth (authenticated seller token)

Source: `p50-monitor-ml-controlled-sale.ts` → `MercadoLibreService.getItem`.

### Pre-recovery snapshot

- **`generatedAt`:** `2026-03-24T22:42:50.614Z`
- **`liveItem.status`:** `under_review`
- **`liveItem.sub_status`:** `["waiting_for_patch"]`
- **`liveItem.health`:** `null` (no extra moderation payload in our snapshot type)
- **`liveItem.permalink`:** `https://articulo.mercadolibre.cl/MLC-3786354420-soporte-organizador-de-enchufes-montado-en-la-pared-esta-_JM`
- **Picture IDs:** `630860-MLC109380016497_032026`, `635707-MLC108574302632_032026`

### Local DB at same timestamp (context)

- **`product.status`:** `PUBLISHED`, **`isPublished`:** `true`
- **`listing.status`:** `failed_publish` (drift vs API / prior automation)

**Conclusion (pre-recovery):** API showed a **real** moderation hold again (`waiting_for_patch`), not merely local drift.

## B) Public-facing HTTP truth (automation)

### B1 — `HEAD` on permalink (existing `p50` behavior)

- **`permalinkHeadStatus`:** **403** (pre- and post-recovery)

This **does not** prove the listing is deleted or unsellable; MercadoLibre often rejects unauthenticated `HEAD`.

### B2 — `GET` with browser `User-Agent` (curl + Node `fetch`)

- **HTTP status:** **200**
- **Response body size (representative):** **~2433 bytes** (saved sample from execution environment)
- **Content:** Minimal HTML with spinner + **JavaScript `verifyChallenge`** / cookie `_bmstate` pattern — a **bot/perimeter challenge shell**, not a product detail document.
- **Listing slug / API id strings:** **Not present** in the raw HTML (no `MLC-3786354420`, no `ui-pdp`, no `schema.org/Product` in the challenge document).

### B3 — Unauthenticated `GET https://api.mercadolibre.com/items/MLC3786354420`

- From the same execution environment, **403** was observed (with and without a browser UA).

So **anonymous REST** cannot be used here as a second API truth source.

## Dual-state classification (mapped to sprint taxonomy)

The sprint list assumes “public ok” or “public error” as **observable HTML**. Here, automation receives a **challenge shell**, not a PDP.

| Sprint enum candidate | Applies? |
|------------------------|----------|
| `api_active_public_ok` | **No** (pre: not active; post: active but no PDP HTML in fetch) |
| `api_active_public_error` | **Misleading** — not proven ML “error page”; challenge ≠ confirmed buyer error |
| `api_under_review_public_error` | **Partially** — pre-recovery API was under review; “public” is **not** a confirmed ML error body |
| `api_under_review_public_ok` | **No** |
| `api_blocked_public_error` | **No** |
| `unknown_due_runtime_issue` | **No** |

**Exact label used in P63:** **`api_under_review_automation_gets_challenge_shell`** (pre-recovery) → after recovery see `P63_STABILITY_VERIFICATION.md` (**`api_active_automation_gets_challenge_shell`**).

These refine the list without fabricating a rendered PDP.

## Code change (this sprint)

`p50` now emits **`permalinkPublicProbe`** (browser-like `GET`, error hints, **`challengeShellDetected`**, body size) so future runs capture this duality in one JSON blob.
