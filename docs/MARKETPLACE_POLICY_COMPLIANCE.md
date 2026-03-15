# Marketplace policy compliance

This document summarizes listing rules for eBay, Mercado Libre, and Amazon as enforced by the codebase. Implementation: `backend/src/utils/compliance/index.ts` and `backend/src/services/mercadolibre.service.ts` (ML-specific).

## eBay

- **Title:** Max 80 characters. Alphanumeric, spaces, basic punctuation; no promotional phrases ("view my other listings", etc.). IP policy: avoid "tipo X", "símil X", "réplica" — use "compatible con X" instead.
- **Description:** Same IP and promo rules; max 50,000 characters.
- **Keyword Spam Policy:** No stuffing; no "view my other eBay listings" or similar.
- **Responsibility:** Seller responsible for delivery and customer satisfaction.

Implementation: `sanitizeTitleForEbay`, `sanitizeDescriptionForEbay`, `checkMarketplaceCompliance('ebay', ...)`.

## Mercado Libre

- **Title and description:** No "tipo X", "símil X", "réplica", "idéntico a", "igual a" for brands; use "compatible con X" or "Genérico" for unbranded. Accurate description required.
- **Images:** Min 15 KB; recommended 1200x1200; no logos/text on cover. See `docs/MERCADOLIBRE_COMPLIANCE.md`.
- **Category:** Must be correct; some categories require video.
- **Duplicates:** Same product with same conditions not allowed; use one listing with variants or differentiate (e.g. shipping/payment).

Implementation: `sanitizeTitleForML`, `sanitizeDescriptionForML`, `checkMLCompliance` in `mercadolibre.service.ts`.

## Amazon

- **Title:** Max 200 characters. No decorative characters; no promotional phrases ("free shipping", "best seller", "hot item", "limited time", "act now", "buy now", "click here", "sale!"). Sentence case (no ALL CAPS). IP policy same as above.
- **Description:** Same restrictions; no prohibited promotional content.
- **Seller:** Must be merchant of record; no supplier branding in listing.

Implementation: `sanitizeTitleForAmazon`, `sanitizeDescriptionForAmazon`, `checkMarketplaceCompliance('amazon', ...)`.

## Where compliance is applied

- **Publish flow:** `marketplace.service.ts` applies sanitization and `checkMarketplaceCompliance` before calling eBay/ML/Amazon APIs.
- **Preview:** `generateListingPreview` runs the same sanitization so preview matches what would be published.
- **Pre-save:** Product preview/approval flow can call `checkMarketplaceCompliance` read-only to show violations before publish.

## References

- `backend/src/utils/compliance/index.ts` — central sanitizers and validators
- `backend/src/services/mercadolibre.service.ts` — ML sanitization and image quality
- `docs/MERCADOLIBRE_COMPLIANCE.md` — ML-specific IP, images, categories
