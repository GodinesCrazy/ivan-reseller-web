# P69 — Final listing resolution snapshot

**As of:** 2026-03-25 (post-`p49`) · **Listing:** `MLC3786354420` · **Product:** `32690`

## API / operational truth (strong)

- **`liveItem.status`:** `active`
- **`liveItem.sub_status`:** `[]`
- **Pictures (ML CDN):** `634094-MLC108578254556_032026`, `728696-MLC109385244991_032026`
- **Source pack:** two **different** AliExpress `/kf/S…` ids (see `docs/P69_TWO_REAL_IMAGE_PACK_REBUILD.md`)
- **`p49` classification:** `listing_active_policy_clean`

## Seller + buyer (weak / unproven in automation)

| Dimension | State |
|-----------|--------|
| Seller photo warning | **`unknown_due_missing_operator_confirmation`** |
| Buyer PDP | **`unknown_due_challenge_shell`** |

## Exact combined outcome label

**`listing_active_two_real_images_deployed_seller_and_pdp_unverified`**

(Maps to mission options as: **not** `seller_warning_cleared_and_pdp_ok`; **not** an isolated new technical blocker beyond **known verification limits** — the remaining gap is **evidence**, not a failed replace.)

## If operator later confirms both clear

Upgrade label to: **`seller_warning_cleared_and_pdp_ok`** (only with captured seller text + human PDP check).
