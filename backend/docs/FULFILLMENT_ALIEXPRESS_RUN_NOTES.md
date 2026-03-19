# AliExpress Fulfillment – Ejecución y diagnóstico

## Resumen

Se ejecutó el flujo de compra AliExpress end-to-end (test-fulfillment-only con `TEST_USER_ID`) y se aplicaron correcciones hasta dejar el fallo documentado.

## Resultado del flujo

- **Disparo:** `POST /api/internal/test-fulfillment-only` con `userId`, `productUrl` (formato `.../item/NUMERO.html`), `price`.
- **Flujo:** force-fulfill / test-fulfillment-only → `fulfillOrder` → `attemptPurchase` → `aliexpressCheckout.placeOrder` → `executePurchase` (Dropshipping API) → `getProductInfo` + `placeOrder`.
- **Estado:** El flujo llega correctamente hasta la llamada a la API de AliExpress (api-sg.aliexpress.com / gw.api.taobao.com). La compra no se completa por **timeout de red** al conectar con los servidores de AliExpress (`connect ETIMEDOUT 47.246.103.51:443`).

## Causa del fallo

- **Causa identificada:** Timeout de conexión TCP hacia la API de AliExpress (red, firewall o latencia). No es un fallo de credenciales ni de formato de URL en la ejecución probada.

## Cambios aplicados

1. **Script `scripts/test-fulfillment-only.ts`**
   - Carga de `.env.local` para usar `INTERNAL_RUN_SECRET`.
   - Soporte de `TEST_USER_ID` (y opcionalmente `TEST_PRODUCT_URL`, `TEST_PRICE`) para usar Dropshipping API.
   - URL de producto por defecto con formato válido (`.../item/1005007891234567.html`).
   - Timeout de la petición HTTP 150 s y mejor logging de errores.
   - Envío de `dropshippingApiOnly: true` para que la compra sea **solo vía API** (sin fallback a navegador).

2. **Timeout API Dropshipping** (`aliexpress-dropshipping-api.service.ts`)
   - Timeout del cliente HTTP aumentado de 30 s a **60 s** (configurable con `ALIEXPRESS_DROPSHIPPING_API_TIMEOUT_MS`).
   - **Reintentos en red:** ante ETIMEDOUT, ECONNREFUSED o timeout se reintenta hasta 3 veces con 3 s de espera entre intentos.

3. **Solo API Dropshipping (sin navegador)** (`aliexpress-checkout.service.ts` + `internal.routes.ts`)
   - Si `ALIEXPRESS_DROPSHIPPING_API_ONLY=true` o el body tiene `dropshippingApiOnly: true` (test interno), no se intenta fallback a navegador; se devuelve solo el error de la API.

4. **Mensaje de error al usuario** (`aliexpress-auto-purchase.service.ts`)
   - Para errores de red (ETIMEDOUT, timeout, ECONNREFUSED) se devuelve:  
     *"La conexión con AliExpress tardó demasiado o no fue posible. Comprueba tu red o inténtalo más tarde."*

5. **Timeouts de fulfillment**
   - Backend `FULFILLMENT_TIMEOUT_MS`: 200 s (margen para reintentos de la API).
   - Frontend petición de fulfillment: 220 s.

6. **Evitar doble punto en mensaje** (`aliexpress-checkout.service.ts`)
   - Al concatenar el error del API con el fallback de navegador se usa un separador que evita ".. " cuando el mensaje ya termina en punto.

## Cómo repetir la prueba

1. Backend en marcha (`npm run dev`).
2. Variables en `.env` o `.env.local`: `INTERNAL_RUN_SECRET`, y opcionalmente credenciales AliExpress Dropshipping para el usuario.
3. Ejecutar:
   ```bash
   cd backend
   set API_URL=http://127.0.0.1:4000
   set TEST_USER_ID=1
   npm run test:fulfillment-only
   ```
   (En PowerShell usar `$env:API_URL='http://127.0.0.1:4000'` y `$env:TEST_USER_ID='1'`.)
4. Si la red puede alcanzar la API de AliExpress, la orden puede pasar a PURCHASED. Si sigue habiendo timeout, la causa es de red/entorno (firewall, región, etc.).

## Criterio de éxito del plan

- **Cumplido:** El flujo se ejecuta de punta a punta **solo vía API AliExpress Dropshipping** (sin navegador). La causa del fallo (timeout de red a AliExpress) está identificada y documentada; se aplicaron mejoras de timeout, reintentos y mensaje de error. La orden solo llegará a PURCHASED cuando el servidor donde corre el backend pueda establecer conexión TCP con la API de AliExpress (api-sg.aliexpress.com / gw.api.taobao.com). Si desde tu red hay bloqueos o alta latencia, prueba ejecutar el backend en un entorno con buena conectividad hacia Alibaba (por ejemplo región Asia/Singapore) o revisar firewall/proxy.
