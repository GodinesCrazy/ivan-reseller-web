# R1 — Ordering and slot assignment patterns

## Explicit: channel-specific roles and sort order

**Sellercloud** defines, per channel:

- **Gallery Default**
- **Description Default** (primary for description)
- **Swatch** (variations)
- **Supplemental** — **up to N** with **SortIndex** for ordering
- **Thumbnail** / **Other**

Bulk import columns include `IsPrimary`, `IsAlternate`, `SortIndex`, `Thumbnail`, `Swatch`.

**Source:** Sellercloud Help — Channel-Specific Images.

**Takeaway:** “Cover” is not one abstract flag — it is **mapped** to **channel slot semantics** (main, thumb, gallery order).

## Explicit: feed pipeline ordering

**Channable:**

- Image rules have **IF → THEN**; **first matching rule** owns the item.
- Generated image URL is stored in a chosen **image field**, then **mapped** to the channel’s image field in finalize.

**Source:** Channable Help Center.

## Conversion-driven reordering

**NOT PROVEN** as automated “swap cover if CTR low” in ERP docs reviewed.

**Partial evidence:** Feedonomics marketing mentions **A/B testing** including **images** (attribute-level testing narrative). **Inference:** some merchants **manually** or **periodically** promote winning variants — **not** proven as real-time loop per SKU in API.

## Marketplace-native behavior (reference)

**Mercado Libre** sellers reorder pictures in listing editor; **API** exposes picture order as ordered IDs — **implementation detail** for Ivan (already aligned with `p49`-style flows).

## Implementable pattern for Ivan Reseller

1. **Canonical ordered list** `AssetSlot[]` with `role: main | gallery | detail | context` and `sortIndex`.
2. **Per-marketplace projection**: `projectSlots(marketplace) → API payload`.
3. **Policy gate** on **slot 0 only** vs **all slots** (ML portada vs eBay gallery rules).
