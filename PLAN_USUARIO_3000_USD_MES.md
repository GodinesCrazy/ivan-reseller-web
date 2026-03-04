# Plan usuario: $3000 USD en el primer mes ? Ivan Reseller

**Objetivo:** Usar el sistema como usuario y aspirar a **al menos 3000 USD en el primer mes**, con flujo autom?tico: tendencias ? AliExpress ? eBay ? repricing ? detecci?n de ventas ? compra al proveedor ? env?o al cliente.

---

## 1. Estado actual del sistema (?est? listo al 100%?)

### Lo que ya funciona de extremo a extremo

| Paso | Componente | Estado |
|------|------------|--------|
| 1. Tendencias | `TrendsService` + SerpAPI/Google Trends | ? Requiere `SERP_API_KEY` o `GOOGLE_TRENDS_API_KEY` |
| 2. B?squeda AliExpress | `AliExpressSearchService` / Affiliate API / scraping | ? Requiere credenciales AliExpress (Affiliate o Dropshipping) |
| 3. Oportunidades | `OpportunityFinder` (margen, ROI, tendencias) | ? Operativo |
| 4. Publicar en eBay | `MarketplaceService` + `EbayService` | ? Requiere eBay OAuth (EBAY_APP_ID, EBAY_CERT_ID, tokens) |
| 5. Repricing | `DynamicPricingService` + `MarketplaceService.syncProductPrice` | ? Operativo (intervalo por env o config) |
| 6. Detecci?n de ventas | Webhooks eBay/MercadoLibre ? `recordSaleFromWebhook` ? Order | ? Requiere webhooks configurados en eBay/PayPal |
| 7. Fulfillment | `OrderFulfillmentService.fulfillOrder` ? `purchaseRetryService.attemptPurchase` | ? Requiere AliExpress Dropshipping API o `ALLOW_BROWSER_AUTOMATION` |
| 8. Env?o al cliente | AliExpress env?a al cliente; tracking se actualiza | ? Depende del proveedor |

### Requisitos para que el flujo sea 100% operativo

- **APIs y credenciales (backend / Railway):**
  - `SERP_API_KEY` o `GOOGLE_TRENDS_API_KEY` ? tendencias reales.
  - AliExpress: Affiliate (b?squeda) y/o Dropshipping (compra): `ALIEXPRESS_DROPSHIPPING_*` o OAuth completado.
  - eBay: `EBAY_APP_ID`, `EBAY_CERT_ID`, OAuth completado (refresh token en DB o env).
  - Scraping (fallback): `SCRAPER_API_KEY` o `ZENROWS_API_KEY` (autopilot los exige).
  - PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` si hay captura de pago autom?tica.
- **Base de datos y cache:** `DATABASE_URL`, `REDIS_URL`.
- **Seguridad:** `JWT_SECRET`, `ENCRYPTION_KEY` (? 32 caracteres).
- **Webhooks:** eBay/PayPal configurados para apuntar a tu backend (ej. `https://tu-backend.up.railway.app/api/webhooks/ebay`).
- **Capital y l?mites:** Capital de trabajo configurado en el usuario (Configuraci?n / Autopilot o UserWorkflowConfig). L?mites diarios (`MAX_DAILY_ORDERS`, `MAX_DAILY_SPEND_USD`) si aplican.
- **Autopilot:** Respeto de tope de listados activos (`maxActiveProducts`) ? **ya implementado** en `processOpportunities`.

**Conclusi?n:** El software **puede** ejecutar el flujo autom?tico completo siempre que las variables anteriores est?n configuradas y los webhooks apunten al backend. Sin esas configuraciones, tendencias, publicaci?n o compra autom?tica pueden fallar o no ejecutarse.

---

## 2. Cantidad de art?culos y configuraci?n para ~$3000/mes

### Metas orientativas (primer mes)

- **Objetivo ingresos:** ? 3000 USD (ventas brutas).
- **Conversi?n t?pica:** 1?3% de visitas a venta; con 100?300 listados activos y tr?fico moderado, unas 30?100 ventas/mes son plausibles.
- **Ticket medio orientativo:** 25?50 USD ? 60?120 ventas para 3000 USD.

### Cantidad de art?culos a publicar

| Concepto | Valor recomendado | Notas |
|----------|-------------------|--------|
| **Listados activos m?ximos (primer mes)** | 150?300 | Permite volumen sin saturar capital ni APIs. |
| **Publicaciones por ciclo Autopilot** | 3?8 | `maxOpportunitiesPerCycle`; equilibrio entre velocidad y tasa de ?xito. |
| **Intervalo entre ciclos** | 60?120 min | M?s ciclos = m?s candidatos; respetar l?mites de eBay/AliExpress. |
| **Productos ?ganadores? a duplicar** | Seg?n motor (opcional) | Duplicar listados de productos con mejor rendimiento cuando est? habilitado. |

### Configuraci?n detallada recomendada

- **Autopilot**
  - `maxActiveProducts`: **250** (tope de listados activos).
  - `cycleIntervalMinutes`: **90**.
  - `maxOpportunitiesPerCycle`: **5**.
  - `minProfitUsd`: **8**.
  - `minRoiPct`: **40**.
  - `workingCapital`: **800?1500** USD (seg?n tu liquidez).
  - `minSupplierPrice`: **2** (evitar productos demasiado baratos).
  - `maxSupplierPrice`: **35** (evitar productos caros que atan capital).
  - `repricingIntervalHours`: **12** (reprecio cada 12 h).
  - `targetCountry`: **US** (o el mercado donde vendes).
  - `searchQueries`: lista de 8?15 t?rminos basados en tendencias (ver abajo).

- **B?squedas (tendencias / queries)**  
  Ejemplos para `searchQueries` (ajustar seg?n Google Trends / SerpAPI):
  - phone case, wireless earbuds, usb charger, led strip, car phone holder, smart watch band, portable bluetooth speaker, kitchen organizer, yoga mat, resistance bands, desk organizer, cable organizer.

- **Repricing**
  - Intervalo: 12 h (o el que permita tu plan).
  - Objetivo: mantener margen m?nimo (profit guard) y ser competitivo frente a competencia (competitor analyzer).

- **Fulfillment**
  - Capital libre suficiente para cubrir compras pendientes (working capital y l?mites diarios).
  - AliExpress Dropshipping API operativa o compra asistida seg?n tu configuraci?n.

---

## 3. Flujo autom?tico esperado

1. **Autopilot (cada 90 min):**
   - Obtiene tendencias (SerpAPI/Google Trends).
   - Busca oportunidades en AliExpress con esas tendencias.
   - Filtra por margen (minProfitUsd, minRoiPct) y capital.
   - Si listados activos < maxActiveProducts, publica en eBay hasta el tope.
2. **Repricing (cada 12 h):**
   - Actualiza precios de listados activos seg?n competencia y profit guard.
3. **Venta en eBay:**
   - eBay/PayPal notifica v?a webhook ? backend crea Order (PAID).
4. **Fulfillment:**
   - `fulfillOrder` verifica capital y direcci?n; llama a `purchaseRetryService.attemptPurchase` (AliExpress).
   - Order pasa a PURCHASED; se crea Sale; proveedor env?a al cliente.
5. **Seguimiento:**
   - Tracking y notificaciones seg?n implementaci?n actual.

---

## 4. Configuraci?n ideal a inyectar en el software

**Antes de inyectar:** Aseg?rate de que el sistema cumple el apartado 1 (variables de entorno, webhooks, credenciales). Sin eso, el flujo no ser? 100% autom?tico.

### 4.1 Autopilot (API)

Los valores por defecto del Autopilot en el codigo ya coinciden con este plan. Si no hay config guardada en BD, se usan esos valores. Para sobrescribir o aplicar manualmente: la configuraci?n con **PUT /api/autopilot/config** (autenticado). Ejemplo de cuerpo (opcional; los defaults en codigo ya son estos):

```json
{
  "enabled": true,
  "cycleIntervalMinutes": 90,
  "maxOpportunitiesPerCycle": 5,
  "workingCapital": 1200,
  "minProfitUsd": 8,
  "minRoiPct": 40,
  "maxActiveProducts": 250,
  "minSupplierPrice": 2,
  "maxSupplierPrice": 35,
  "repricingIntervalHours": 12,
  "targetCountry": "US",
  "targetMarketplace": "ebay",
  "searchQueries": [
    "phone case",
    "wireless earbuds",
    "usb charger",
    "led strip",
    "car phone holder",
    "smart watch band",
    "portable bluetooth speaker",
    "kitchen organizer",
    "yoga mat",
    "resistance bands",
    "desk organizer",
    "cable organizer"
  ]
}
```

- Ajusta `workingCapital`, `maxActiveProducts` y `searchQueries` a tu criterio y tendencias actuales.

### 4.2 Variables de entorno (Railway / backend)

Comprobar que existan (no inyectar secretos en este documento):

- `SERP_API_KEY` o `GOOGLE_TRENDS_API_KEY`
- `EBAY_APP_ID`, `EBAY_CERT_ID`, OAuth eBay completado
- AliExpress Affiliate y/o Dropshipping (seg?n uso)
- `SCRAPER_API_KEY` o `ZENROWS_API_KEY`
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`
- `PAYPAL_*` si aplica
- Opcional: `DYNAMIC_PRICING_INTERVAL_HOURS=12` si no usas el valor de autopilot config

### 4.3 Capital y onboarding

- En la UI (Configuraci?n / Autopilot o onboarding), configurar **capital de trabajo** y, si aplica, l?mites diarios.
- Completar onboarding del usuario para que Autopilot pueda arrancar (el backend exige `onboardingCompleted` para usuarios no-admin).

---

## 5. Resumen

- **?El sistema est? en condiciones de hacer el flujo autom?tico al 100%?**  
  **S?**, siempre que tengas: APIs de tendencias, AliExpress, eBay, scraping (para autopilot), webhooks de ventas, y fulfillment (Dropshipping o browser automation) y variables/credenciales listadas arriba.

- **Cantidad de art?culos:** Objetivo **150?250 listados activos** en el primer mes; tope configurado con `maxActiveProducts` (ya respetado por el c?digo).

- **Configuraci?n:** Usar el JSON de **?4.1** en **PUT /api/autopilot/config** y asegurar **?4.2** y **?4.3**.

- **Flujo esperado:** Autopilot publica hasta el tope ? repricing peri?dico ? ventas v?a webhook ? fulfillment compra en AliExpress y env?a al cliente. Con volumen y conversi?n razonables, el objetivo de **? 3000 USD en el primer mes** es alcanzable si las integraciones y el capital est?n bien configurados.
