# E2E — Canary operation plan (web-admin, Mercado Libre Chile)

## Preconditions

- [ ] Railway backend up; `/health` 200.
- [ ] Vercel (or local) frontend points API to correct backend.
- [ ] Postgres migrated; user can log in.
- [ ] Mercado Libre **production** (or sandbox) OAuth OK for **MLC**.
- [ ] `WEBHOOK_SECRET_MERCADOLIBRE` set and ML notifications point to `https://<backend>/api/webhooks/mercadolibre`.
- [ ] AliExpress dropshipping credentials valid for auto-buy (if testing full fulfillment).

## Steps — publish

1. Log in to admin web.
2. Open **Productos** → expand **Canary publicación Mercado Libre (Chile)** → wait for table.
3. Pick a row with **`publishAllowed: sí`** and **`recommended`** (or highest score); click **Preview ML**.
4. Confirm preflight: estado `ready_to_publish`, imágenes publishSafe, postsale webhook sí si lo exige el entorno.
5. Use **Intelligent Publisher** / approval flow as your tenant normally does, or `POST /api/marketplace/publish` with `marketplace: mercadolibre` from tooling.
6. Verify **`marketplaceListing`** / ML listing URL live.

## Steps — purchase → automation

7. From a **test buyer** account, purchase the listing on ML (minimal value SKU).
8. Watch backend logs for webhook receipt and `Order` creation.
9. In app: **Órdenes** / notifications; confirm move to **PURCHASED** or manual queue with explicit error.
10. Confirm **AliExpress** order id on the internal order when automation succeeds.

## Success criteria

- Publish completes without bypassing preflight.
- Webhook creates **one** internal order (idempotent replay safe).
- Fulfillment either **purchases** or surfaces a **clear, actionable** error (capital, SKU, API).

## Rollback / fail-safe

- **Unpublish** product (`POST /api/products/:id/unpublish`) if listing must come down.
- **Cancel** ML order per ML buyer policies (outside app).
- If duplicate webhooks or stuck `PURCHASING`, use internal order tools / DB ops per runbook (not automated here).

## SKU selection

- Prefer canary table winner; **avoid** known image-blocked SKUs unless testing remediation explicitly.
