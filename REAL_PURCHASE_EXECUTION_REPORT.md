# REAL PURCHASE EXECUTION REPORT

**Objetivo:** Confirmar y activar el mecanismo de compra real automática (fulfillment real) sin modificar arquitectura ni romper funcionalidad.  
**Base:** Código real en `order-fulfillment.service.ts`, `purchase-retry.service.ts`, `aliexpress-checkout.service.ts`, `aliexpress-auto-purchase.service.ts`, `aliexpress-dropshipping-api.service.ts`.

---

## REAL PURCHASE SERVICE

**Clase que ejecuta la compra real:** `AliExpressAutoPurchaseService` (archivo `backend/src/services/aliexpress-auto-purchase.service.ts`).

**Cadena de llamadas (código real):**
- `OrderFulfillmentService.fulfillOrder(orderId)` ? `PurchaseRetryService.attemptPurchase(...)` ? `AliExpressCheckoutService.placeOrder(request)` ? `AliExpressAutoPurchaseService.executePurchase(request, undefined)`.

**Dos rutas de compra real dentro de `AliExpressAutoPurchaseService.executePurchase`:**
1. **Dropshipping API** (solo si se llama con `userId`): usa `CredentialsManager.getCredentials(userId, 'aliexpress-dropshipping', env)` y `aliexpressDropshippingAPIService.placeOrder()`. En el flujo actual **nunca se usa** porque `AliExpressCheckoutService.placeOrder` llama `executePurchase(..., undefined)` (no recibe ni pasa `userId`).
2. **Puppeteer (browser)** ? ruta que sí se usa cuando la compra no es simulada: login en AliExpress con credenciales, navegación al producto, ?Buy Now?, rellenar dirección, confirmar y extraer `orderNumber` como `orderId`. Esta es la **única ruta de compra real activable solo con configuración** en el flujo actual.

---

## PURCHASE ACTIVATION CONDITION

**Condición exacta en código que activa compra real (no simulada):**

En `backend/src/services/aliexpress-checkout.service.ts`, método `placeOrder`:

```ts
const allowBrowser = env.ALLOW_BROWSER_AUTOMATION ?? false;
const autopilotMode = (process.env.AUTOPILOT_MODE || 'sandbox') as 'production' | 'sandbox';

if (!allowBrowser) {
  if (autopilotMode === 'production') {
    throw new Error('... Set ALLOW_BROWSER_AUTOMATION=true.');
  }
  return { success: true, orderId: 'SIMULATED_ORDER_ID', ... };
}
// Si allowBrowser === true continúa:
const aliUser = (process.env.ALIEXPRESS_USER || '').trim();
const aliPass = (process.env.ALIEXPRESS_PASS || '').trim();
if (!aliUser || !aliPass) {
  if (autopilotMode === 'production') {
    throw new Error('... Configure ALIEXPRESS_USER and ALIEXPRESS_PASS.');
  }
  return { success: true, orderId: 'SIMULATED_ORDER_ID', ... };
}
// Si hay usuario y contrase?a: setCredentials, login(), executePurchase() ? compra real (Puppeteer).
```

**Resumen:**  
Compra **real** se ejecuta si y solo si:
- `ALLOW_BROWSER_AUTOMATION === true` (env/`env.ts`: default `false`), **y**
- `ALIEXPRESS_USER` y `ALIEXPRESS_PASS` están definidos y no vacíos.

Además, en `aliexpress-auto-purchase.service.ts`, `loadPuppeteer()` lanza si `DISABLE_BROWSER_AUTOMATION === 'true'`, por lo que para compra real ese flag no debe ser `'true'`.

---

## ENV VARIABLES REQUIRED

| Variable | Obligatoria | Efecto |
|----------|-------------|--------|
| `ALLOW_BROWSER_AUTOMATION` | Sí | Debe ser `true` para que `placeOrder` use Puppeteer en lugar de devolver `SIMULATED_ORDER_ID`. |
| `ALIEXPRESS_USER` | Sí | Email (o usuario) de la cuenta AliExpress para login. |
| `ALIEXPRESS_PASS` | Sí | Contrase?a de la cuenta AliExpress. |
| `DISABLE_BROWSER_AUTOMATION` | No (pero no debe ser `true`) | Si es `'true'`, `loadPuppeteer()` lanza y la compra real falla. Debe estar ausente o ser `false`. |
| `AUTOPILOT_MODE` | No | Si es `production`, en stub o sin credenciales se lanza error en lugar de devolver simulado. |
| `PUPPETEER_EXECUTABLE_PATH` / `CHROMIUM_PATH` | Opcional | Usadas por `chromium.ts` para lanzar el browser; en entornos tipo Railway/serverless pueden ser necesarias si Chromium no se resuelve solo. |
| `HEADLESS` / `PUPPETEER_HEADLESS` | Opcional | Por defecto headless = true; `'false'` para ventana visible (útil en depuración). |

---

## REQUIRED CREDENTIALS

- **Cuenta AliExpress:** usuario (email) y contrase?a que se inyectan vía `ALIEXPRESS_USER` y `ALIEXPRESS_PASS`. Es la misma cuenta con la que Puppeteer hace login en `https://login.aliexpress.com/` y coloca la orden. La cuenta debe tener método de pago válido y permitir compras (sin 2FA bloqueante, o con 2FA manejada; el código tiene un wait corto para 2FA pero no introduce el código automáticamente).

No se requieren credenciales de Dropshipping API para activar la compra real en el flujo actual, porque ese camino no se usa al no pasarse `userId` a `executePurchase`.

---

## IS SYSTEM READY FOR REAL PURCHASE RIGHT NOW

**YES**, con condiciones:

- El código está listo para ejecutar compra real **solo con configuración** (env + entorno de ejecución).
- Condiciones:
  1. `ALLOW_BROWSER_AUTOMATION=true`.
  2. `ALIEXPRESS_USER` y `ALIEXPRESS_PASS` configurados con una cuenta AliExpress válida.
  3. `DISABLE_BROWSER_AUTOMATION` no sea `'true'`.
  4. El entorno donde corre el backend (p. ej. Railway, VPS) tenga Chromium disponible o que Puppeteer pueda usar (p. ej. `@sparticuz/chromium` o Chromium del sistema según `utils/chromium.ts`). Si en ese entorno Puppeteer/Chromium no arranca, la compra real fallará por entorno, no por falta de lógica.

---

## IF NO, WHAT EXACTLY IS MISSING

Si en un despliegue concreto la compra real no funciona, lo que puede faltar es **solo configuración o entorno**:

1. **Env:** `ALLOW_BROWSER_AUTOMATION=true`, `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`; y que `DISABLE_BROWSER_AUTOMATION` no sea `'true'`.
2. **Chromium en el servidor:** En entornos sin GUI (Railway, Docker, etc.) debe existir un binario Chromium (instalado por Nixpacks, `PUPPETEER_EXECUTABLE_PATH`, `@sparticuz/chromium`, o el que use Puppeteer). Si no hay Chromium ejecutable, `initBrowser()`/Puppeteer fallará.
3. **Cuenta AliExpress:** Método de pago válido y, si hay 2FA, que no bloquee el flujo automático (el código no introduce código 2FA; si AliExpress lo exige siempre, haría falta intervención manual o soporte 2FA en el flujo).

No se requiere desarrollo nuevo para ?activar? la compra real; solo ajustar env y asegurar Chromium en el runtime.

---

## CODE CHANGES REQUIRED

**NONE.**

La compra real se activa únicamente con variables de entorno y entorno de ejecución adecuado (Chromium disponible). No hace falta modificar servicios, rutas ni arquitectura.

---

## STEP-BY-STEP ACTIVATION INSTRUCTIONS

1. **Variables de entorno (backend):**
   - `ALLOW_BROWSER_AUTOMATION=true`
   - `ALIEXPRESS_USER=<email o usuario de la cuenta AliExpress>`
   - `ALIEXPRESS_PASS=<contrase?a de la cuenta AliExpress>`
   - No definir `DISABLE_BROWSER_AUTOMATION` o definirla distinta de `true` (p. ej. `false`).

2. **Opcional para producción estricta:**
   - `AUTOPILOT_MODE=production` (así, si en algún momento se cae a stub por error de config, el sistema lanzará error en lugar de devolver simulado).

3. **Entorno de ejecución (servidor/Railway/Docker):**
   - Asegurar que Chromium esté disponible (p. ej. buildpack que instale Chromium, o `PUPPETEER_EXECUTABLE_PATH` apuntando al binario, o uso de `@sparticuz/chromium` según `utils/chromium.ts`). En Railway, comprobar que el build/run incluya Chromium si se usa browser automation.

4. **Cuenta AliExpress:**
   - Usar una cuenta con saldo o método de pago válido; si tiene 2FA, valorar si el flujo actual (espera corta) es suficiente o si hace falta completar login/2FA manualmente la primera vez.

5. **Verificación:**
   - Disparar un fulfillment real (Order en estado PAID con `productUrl` y dirección válidas) y revisar logs: debe aparecer `[ALIEXPRESS-CHECKOUT] LOGIN OK`, `ORDER PLACED` con un `orderId` distinto de `SIMULATED_ORDER_ID`, y el Order debe pasar a PURCHASED y generarse Sale y payout según el flujo existente.

---

## EXPECTED FINAL FLOW

Con compra real activada por configuración:

1. Order en estado **PAID** (creado tras capture de PayPal).
2. **Fulfillment:** `fulfillOrder` ? `attemptPurchase` ? `placeOrder` (con `ALLOW_BROWSER_AUTOMATION=true` y credenciales) ? `AliExpressAutoPurchaseService.executePurchase` (ruta Puppeteer) ? login AliExpress, producto, Buy Now, dirección, confirmar ? `orderId` real.
3. `order-fulfillment.service` actualiza Order a **PURCHASED** y guarda `aliexpressOrderId`.
4. `createSaleFromOrder(orderId)` crea **Sale** (si Order tiene `userId` y producto identificable).
5. **Commission** y **AdminCommission** se crean dentro de `createSale`.
6. **Payout** (admin y usuario vía PayPal, o Payoneer si estuviera implementado) se ejecuta en `sale.service` según la lógica actual.

Flujo final: **Order ? PURCHASED ? Sale ? Commission ? Payout**.

---

## RISK LEVEL

**MEDIUM.**

- **Riesgos operativos:** Cuenta AliExpress expuesta en env (recomendable usar secretos del entorno y rotar si hay fuga). Puppeteer/Chromium en producción puede ser inestable (timeouts, cambios de DOM en AliExpress, captchas). 2FA puede bloquear el login.
- **Riesgos de negocio:** Compras automáticas con cargo real; conviene límites (p. ej. `checkDailyLimits`, `checkProfitGuard`) ya presentes en el código.
- **Sin cambios de código:** No se introduce riesgo de regresión por refactor; el riesgo es de configuración y entorno (Chromium + cuenta AliExpress).

---

*Informe basado únicamente en lectura del código indicado. No se ha modificado ningún archivo.*
