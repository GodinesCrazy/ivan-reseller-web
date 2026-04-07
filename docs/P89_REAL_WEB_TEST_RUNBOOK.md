# P89 — Real web test runbook (controlled)

## Preconditions

- Product **VALIDATED_READY** with Chile freight truth persisted (if MLC/CL).  
- ML OAuth + site **MLC** (or consistent with destination).  
- AliExpress Dropshipping API token valid.  
- Images **publishSafe** per remediation pipeline.  
- `GET /api/products/:id/publish-preflight` → `ready_to_publish`.  
- For strict post-sale: `WEBHOOK_SECRET_MERCADOLIBRE` set and `ML_WEB_PUBLISH_REQUIRE_ML_WEBHOOK_SECRET=true` if you want publish blocked without secret.

## Web publication steps

1. Open product preview with `marketplace=mercadolibre`.  
2. Confirm preflight card shows `ready_to_publish`.  
3. Send through Intelligent Publisher or call `POST /api/marketplace/publish` with same environment as credentials.  
4. Capture returned `listingId` / URL.

## After publish

- Listing visible on ML with expected title/price/currency.  
- `preventivePublish` snapshot on product matches published price (drift guard).  

## After test purchase

- Webhook receives notification (verify logs / proof tables if enabled).  
- Order entity created/updated in app (verify your order-ingestion path).  

## Post-sale / fulfill

- Confirm whether auto-purchase ran or manual step required.  
- Align with `P89_WEBHOOK_FULFILL_READINESS_MODEL.md` — do not assume full automation without proof.

## Success criteria

- No 400 from prepare/publish; listing live; economics non-negative per canonical ledger at prepare time.

## Abort / risk control

- Stop if preflight not green.  
- Set `BLOCK_NEW_PUBLICATIONS=true` if incident.  
- Disable strict webhook flag only for non-production sandboxes.
