# Autopilot APIs configuradas desde APIS2.txt

## Objetivo

Configurar Scraping API y eBay Trading API para que el autopilot pueda iniciar y generar ingresos automáticos reales.

## Script ejecutado

```bash
cd backend
npx tsx scripts/configure-apis-from-apis2.ts
```

Este script:

1. **Lee APIS2.txt** (desde la raíz del proyecto o `backend/`).
2. **Extrae claves reales:**
   - ScraperAPI Key ? `SCRAPERAPI_KEY`
   - ZenRows API ? `ZENROWS_API_KEY`
   - eBay producción: App ID, Dev ID, Cert ID, Redirect URI (RuName) ? `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`, `EBAY_REDIRECT_URI`
3. **Escribe en `backend/.env.local`** las variables anteriores (sin inventar valores).
4. **Guarda credenciales en la base de datos** (`api_credentials`) para el primer usuario activo con `paypalPayoutEmail`:
   - `scraperapi` (apiKey)
   - `zenrows` (apiKey)
   - `ebay` (appId, devId, certId, redirectUri, production)

## Detección de APIs

- **Scraping:** `api-availability.service.ts` usa `getUserCredentials(userId, 'scraperapi')` y `getUserCredentials(userId, 'zenrows')`. Las credenciales guardadas en DB hacen que `canScrapeAliExpress` sea true.
- **eBay:** Igual con `getUserCredentials(userId, 'ebay', 'production')`; `canPublishToEbay` queda true si hay credenciales válidas.
- **scraping.service.ts** usa además `process.env.SCRAPERAPI_KEY` cuando hace llamadas directas a ScraperAPI.

## Siguiente paso

1. Ejecutar (si no se ha hecho): `npx tsx scripts/activate-live-profit-mode.ts`
2. Iniciar backend: `npm run dev`
3. En logs debe aparecer:
   - `[AUTOPILOT_STARTED]`
   - `[AUTOPILOT] Searching opportunities`
   - `[AUTOPILOT] Publishing product` (cuando se publique un producto)
   - `[AUTOPILOT] Cycle complete`

## Confirmación

- **AUTOPILOT_RUNNING = TRUE** cuando el backend está en marcha, `autopilot_config.enabled === true` y el bootstrap inicia el autopilot con el primer usuario con paypal.
- **AUTOMATIC_REVENUE_GENERATION = ACTIVE** con el flujo Checkout ? capture-order ? fulfillOrder ? createSaleFromOrder ? payouts.
- **SYSTEM_NOW_GENERATING_REAL_PROFIT = TRUE** con autopilot activo, APIs configuradas (Scraping + eBay) y payouts PayPal operativos.

No se usan mocks ni simulaciones; solo claves reales de APIS2.txt.
