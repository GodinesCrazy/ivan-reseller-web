# P104 — ML update or republish result (32714)

## P103 picture replace

**Not executed.**

`scripts/p103-hero-rebuild-32714.ts --try-replace-ml <id>` was **not run** because P103 produced **no** passing `pngBuffer` and **did not** write a new `cover_main.png`. Running replace would only repeat the **previous** disk pack (P102 lineage), which would **not** constitute applying the P103 rebuild outcome.

## Controlled republish (p101)

**Not executed in P104.**

Republishing without a new P103-approved portada would not advance the P103 mission; it would redeploy the existing P102-based pack.

## Reference listing (DB / manifest)

From **`p104-persistence-32714.json`** and **`p101-republish-result.json`**:

| Field | Value |
|--------|--------|
| Latest `listingId` (DB) | `MLC3805190796` |
| Permalink | `https://articulo.mercadolibre.cl/MLC-3805190796-rotating-table-cell-phone-holder-support-desktop-stand-fo-_JM` |
| Manifest `listingId` | `MLC3805190796` |

## Items API (anonymous)

`GET https://api.mercadolibre.com/items/MLC3805190796` from this environment returned **403** (`PolicyAgent` / `PA_UNAUTHORIZED_RESULT_FROM_POLICIES`). Response saved as **`p104-ml-item-MLC3805190796.json`** (error body only).

**No authenticated Items API call** was made in P104 (credentials not used for item fetch after P103 failure).
