# P67 — Seller reason capture path

**Listing:** `MLC3786354420` · **Product:** `32690`

## Minimum seller-side evidence (for this sprint)

Capture and record:

1. **Which asset is flagged** — Mercado Libre often highlights a specific picture in the listing editor or in a moderation notice (e.g. first vs second gallery slot).
2. **Exact reason text** — copy the Spanish (or English) message verbatim from the seller center / listing health panel (not paraphrased).
3. **Scope** — whether the warning applies to **one** image, **both**, or the **gallery** as a whole.

Optional but high value:

- Screenshot reference (filename + date) stored outside the repo.
- Whether the warning appeared **before** or **after** the last picture replacement (timeline).

## Structured blocker model (operator → JSON-friendly)

| Field | Description |
|--------|-------------|
| `flagged_slot` | `0` \| `1` \| `unknown` (0-based gallery index) |
| `ml_reason_text` | Verbatim string from ML UI |
| `scope` | `single_image` \| `multiple_images` \| `unknown` |
| `captured_at` | ISO timestamp |
| `operator` | Who captured it |

## Operator workflow (repo-aligned)

There is **no** first-class API in this codebase that returns Mercado Libre **seller photo-review** copy; API `items` + `sub_status` can be clean while the seller UI still shows warnings.

**Steps:**

1. Log into Mercado Libre **seller** account linked to the same `userId` as product `32690` (see `P67_EXECUTION_REPORT.md` for runtime `userId`).
2. Open listing **`MLC3786354420`** in the listing editor or **Listing quality / Moderation** (exact menu name varies by site).
3. If a photo warning exists, expand it and **copy full text**; note which thumbnail is referenced.
4. Paste into your runbook / ticket and map into the table above.

**Incorporation:** Use this evidence to confirm or falsify the technical hypothesis (duplicate / low-quality / policy on second image). Automation in P67 cannot replace this step.
