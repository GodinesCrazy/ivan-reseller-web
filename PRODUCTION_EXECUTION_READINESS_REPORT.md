# PRODUCTION EXECUTION READINESS REPORT

**Objetivo:** Validar que el sistema Ivan Reseller Web puede ejecutar compras reales automáticas en producción mediante **configuración únicamente**, sin modificar código.

**Archivos analizados:**
- `backend/src/utils/chromium.ts`
- `backend/src/services/aliexpress-auto-purchase.service.ts`
- `backend/src/services/aliexpress-checkout.service.ts`
- `backend/src/services/order-fulfillment.service.ts`

---

## CHROMIUM EXECUTION METHOD

`chromium.ts` no lanza Chromium por sí solo. Expone:

1. **`resolveChromiumExecutable()`**  
   Resuelve la ruta del binario de Chromium (o `undefined`) y, si encuentra una ruta válida, rellena `process.env.PUPPETEER_EXECUTABLE_PATH` y `process.env.CHROMIUM_PATH`.

2. **`getChromiumLaunchConfig(extraArgs?)`**  
   Llama a `resolveChromiumExecutable()`, construye los argumentos de arranque (incluye `--no-sandbox` y, en entornos Sparticuz, los args de ese módulo), y devuelve un objeto:
   - `executablePath`: resultado de `resolveChromiumExecutable()` (puede ser `undefined`)
   - `args`: array de argumentos para el binario
   - `headless`: según `HEADLESS` o `PUPPETEER_HEADLESS` (por defecto `true`)
   - `defaultViewport`: 1920x1080 o el de `@sparticuz/chromium` si aplica

**Quién lanza Chromium:**  
`AliExpressAutoPurchaseService.initBrowser()` obtiene la config con `getChromiumLaunchConfig()` y llama a `puppeteer.launch({ executablePath, args, defaultViewport, headless })`. El servicio usa **puppeteer-core** (no descarga Chromium); por tanto, en producción `executablePath` debe resolverse a un binario existente en el sistema o proporcionado por `@sparticuz/chromium`.

---

## IS CHROMIUM READY FOR PRODUCTION

**YES**, siempre que en el entorno de producción exista al menos una de estas opciones:

1. **Variable de entorno** que apunte al binario: `PUPPETEER_EXECUTABLE_PATH`, `CHROMIUM_PATH` o `GOOGLE_CHROME_SHIM`.
2. **Binario en una ruta que el código comprueba** (Linux: `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/local/bin/chromium`, `/usr/local/bin/chromium-browser`, `/app/.chromium/chromium`).
3. **`@sparticuz/chromium`** instalado y capaz de proporcionar un ejecutable (habitual en contenedores/serverless).
4. **Puppeteer completo** instalado y con Chromium ya descargado, usado solo para resolver la ruta en `ensureChromiumFromPuppeteer()`; el launch sigue siendo con puppeteer-core y ese path.

Si ninguna de las anteriores se cumple (por ejemplo, Docker sin Chromium ni Sparticuz y sin variables), **NO** está listo hasta configurar path o dependencias.

---

## IF NO, EXACT ENV CONFIGURATION REQUIRED

Configurar **una** de estas variables en el entorno de producción con la ruta absoluta al ejecutable de Chromium:

- `PUPPETEER_EXECUTABLE_PATH=/ruta/absoluta/al/chromium`
- o `CHROMIUM_PATH=/ruta/absoluta/al/chromium`
- o `GOOGLE_CHROME_SHIM=/ruta/absoluta/al/chromium`

Ejemplo en Railway/Linux si Chromium está en PATH pero en una ruta no comprobada por defecto (p. ej. Nix):

- En el servicio, variable: `PUPPETEER_EXECUTABLE_PATH` = salida de `which chromium` en ese mismo entorno (build o runtime), o la ruta que documente el stack (Nixpacks, etc.).

---

## PUPPETEER EXECUTION PATH RESOLUTION

1. **Orden de resolución en `resolveChromiumExecutable()`:**
   - **Entorno ?serverless?** (Railway, Heroku, Vercel, AWS Lambda):  
     - Prioridad 1: rutas candidatas (env + rutas fijas Linux, incl. `/app/.chromium/chromium`).  
     - Prioridad 2: `@sparticuz/chromium.executablePath()`.  
     - Prioridad 3: `ensureChromiumFromPuppeteer()` (Puppeteer completo: `executablePath()` o `browserFetcher`).  
     - Prioridad 4: `undefined` (con puppeteer-core el launch fallaría si no se usa otro path).
   - **Entorno no serverless:**  
     - Primero rutas candidatas (env + Windows o Linux según `os.platform()`).  
     - Luego Puppeteer, luego Sparticuz.  
     - Si nada devuelve path: `undefined`.

2. **Rutas candidatas (orden):**
   - `process.env.PUPPETEER_EXECUTABLE_PATH`
   - `process.env.CHROMIUM_PATH`
   - `process.env.GOOGLE_CHROME_SHIM`
   - En Windows: `%LOCALAPPDATA%\Chromium\Application\chrome.exe`, `Program Files\Google\Chrome\...`, `Program Files (x86)\Google\Chrome\...`
   - En Linux: `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/local/bin/chromium`, `/usr/local/bin/chromium-browser`, `/app/.chromium/chromium`

3. **Comprobación:**  
   Para cada candidato se verifica que el path exista y sea ejecutable (`fs.existsSync` + en Unix `fs.accessSync(..., X_OK)`). La primera ruta válida se devuelve y se guarda en `PUPPETEER_EXECUTABLE_PATH` y `CHROMIUM_PATH`.

4. **Uso en el launch:**  
   `getChromiumLaunchConfig()` pasa ese `executablePath` a `puppeteer.launch()`. Si es `undefined`, puppeteer-core no tiene Chromium propio; en producción es necesario que `resolveChromiumExecutable()` devuelva un path (env, sistema o Sparticuz).

---

## REQUIRED ENV VARIABLES FOR PRODUCTION

Para **activar compras reales** y que el flujo pueda ejecutarse:

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `ALLOW_BROWSER_AUTOMATION` | Sí (=`true`) | Habilita la ruta de compra con navegador en `aliexpress-checkout.service.ts`. |
| `ALIEXPRESS_USER` | Sí | Usuario de la cuenta AliExpress para login y compra. |
| `ALIEXPRESS_PASS` | Sí | Contrase?a de la cuenta AliExpress. |
| `DISABLE_BROWSER_AUTOMATION` | No debe ser `'true'` | Si es `'true'`, `loadPuppeteer()` lanza y bloquea la automatización. |

Para **que Chromium se encuentre** (si no está en una ruta fija que el código ya comprueba):

| Variable | Cuándo | Descripción |
|----------|--------|-------------|
| `PUPPETEER_EXECUTABLE_PATH` | Recomendada en Railway/Docker si la ruta no es estándar | Ruta absoluta al binario de Chromium. |
| o `CHROMIUM_PATH` | Alternativa a la anterior | Misma función. |
| o `GOOGLE_CHROME_SHIM` | Alternativa | Misma función. |
| `HEADLESS` / `PUPPETEER_HEADLESS` | Opcional | `false` para ventana visible; por defecto headless. |

Opcionales para depuración/comportamiento:

- `PUPPETEER_CHROMIUM_REVISION`: solo si se usa la resolución vía Puppeteer (browserFetcher).

---

## REQUIRED SYSTEM DEPENDENCIES

- **Chromium** (o Chrome) instalado y accesible como ejecutable, **o** uso de `@sparticuz/chromium` que aporta su propio binario.
- En **Linux** (Railway/Docker/servidor): dependencias típicas para ejecutar Chromium en headless (evitar errores de librerías faltantes):
  - Bibliotecas: `libnss3`, `libatk1.0-0`, `libatk-bridge2.0-0`, `libcups2`, `libdrm2`, `libxkbcommon0`, `libxcomposite1`, `libxdamage1`, `libxfixes3`, `libxrandr2`, `libgbm1`, `libasound2`.
  - Fuentes (opcional pero recomendable para páginas que las usan): `fonts-liberation`, `fonts-noto-color-emoji`, o equivalente según distro.
- **Node.js** 20 (según Dockerfile y nixpacks.toml).
- **npm** y dependencias del backend instaladas (`puppeteer-core`, `@sparticuz/chromium`, etc.).

**Nota:** Con **nixpacks.toml** (Railway), `nixPkgs = ["nodejs-20_x", "npm", "chromium", "chromedriver"]` instala Chromium; la ruta puede ser la del store de Nix. Si no coincide con las rutas candidatas, configurar `PUPPETEER_EXECUTABLE_PATH` (o `CHROMIUM_PATH`) con la ruta real del binario en ese entorno.

**Dockerfile actual del backend:** No instala Chromium. Para desplegar con ese Dockerfile hay que:
- A?adir la instalación de Chromium (y dependencias anteriores) en la imagen, **o**
- Usar una imagen base que ya lo traiga, **o**
- Confiar en que `@sparticuz/chromium` proporcione el binario en runtime (habitual en contenedores).

---

## CAN SYSTEM EXECUTE REAL PURCHASES IN PRODUCTION RIGHT NOW

**YES**, si se cumplen **todas** estas condiciones:

1. **Variables de activación:**  
   `ALLOW_BROWSER_AUTOMATION=true`, `ALIEXPRESS_USER` y `ALIEXPRESS_PASS` definidos, y `DISABLE_BROWSER_AUTOMATION` distinto de `'true'`.

2. **Chromium disponible:**  
   Al menos una de estas opciones es verdad en el entorno donde corre el backend:
   - Una de las variables `PUPPETEER_EXECUTABLE_PATH`, `CHROMIUM_PATH` o `GOOGLE_CHROME_SHIM` apunta a un Chromium ejecutable, **o**
   - Chromium está instalado en una de las rutas que comprueba el código (p. ej. `/usr/bin/chromium` en Linux o rutas de Windows), **o**
   - `@sparticuz/chromium` está instalado y `chromium.executablePath()` devuelve un path ejecutable en ese entorno (típico en Railway/containers).

3. **Entorno:**  
   - **Railway con nixpacks.toml:** Chromium está instalado por Nix; si la ruta no está en la lista de candidatos, hay que setear `PUPPETEER_EXECUTABLE_PATH` (o `CHROMIUM_PATH`) con la ruta real (p. ej. la que devuelve `which chromium` en ese build/runtime).
   - **Backend con Dockerfile actual:** No hay Chromium en la imagen; hay que a?adirlo o depender de `@sparticuz/chromium` en runtime.

Si falta (1) o (2), la respuesta es **NO** hasta aplicar la configuración indicada.

---

## IF NO, EXACT CONFIGURATION STEPS REQUIRED

1. **En el panel de variables del entorno de producción (Railway, etc.):**
   - `ALLOW_BROWSER_AUTOMATION` = `true`
   - `ALIEXPRESS_USER` = usuario AliExpress
   - `ALIEXPRESS_PASS` = contrase?a AliExpress
   - Asegurarse de que `DISABLE_BROWSER_AUTOMATION` no esté en `true`.

2. **Si Chromium no se encuentra:**
   - **Railway (Nixpacks):** En el mismo proyecto, obtener la ruta del binario (p. ej. en un comando de build o un one-off que ejecute `which chromium` o `command -v chromium`) y definir en variables del servicio:  
     `PUPPETEER_EXECUTABLE_PATH` = esa ruta (o `CHROMIUM_PATH`).
   - **Docker (Dockerfile actual):** O bien instalar Chromium y dependencias en el Dockerfile (y opcionalmente setear `PUPPETEER_EXECUTABLE_PATH` si no está en PATH), o bien no instalar nada y dejar que `@sparticuz/chromium` proporcione el binario (ya está en dependencias); en ese caso no suele hacer falta `PUPPETEER_EXECUTABLE_PATH` si Sparticuz se carga correctamente.

3. **Reiniciar/redesplegar** el backend para que tome las variables y el binario esté disponible.

4. **Comprobar** que un flujo de prueba (orden PAID ? fulfillment ? compra) lleve a `initBrowser()` y a `puppeteer.launch()` sin error de ejecutable.

---

## EXPECTED FINAL EXECUTION FLOW

1. **Login:** `AliExpressAutoPurchaseService.login()` (Puppeteer + Chromium) inicia sesión en AliExpress con `ALIEXPRESS_USER` / `ALIEXPRESS_PASS`.
2. **Buy:** Para una orden PAID, `OrderFulfillmentService.fulfillOrder()` ? `PurchaseRetryService.attemptPurchase()` ? `AliExpressCheckoutService.placeOrder()` ? `AliExpressAutoPurchaseService.executePurchase(request, undefined)` ejecuta la compra en el navegador (Buy Now, confirmación).
3. **Extract orderId:** Tras confirmar la compra, el servicio obtiene el `orderId` real de AliExpress (no simulado).
4. **PURCHASED:** Si `result.orderId !== 'SIMULATED_ORDER_ID'`, la orden se marca como PURCHASED y se crea la venta.
5. **Sale:** `createSaleFromOrder(orderId)` registra la venta.
6. **Payout:** El flujo de payouts existente aplica según la configuración (PayPal, Payoneer, etc.).

Resumen: **Login ? Buy ? Extract orderId ? PURCHASED ? Sale ? Payout.**

---

## RISK LEVEL

**MEDIUM.**

- **Bajo desde el código:** La resolución de Chromium es defensiva (env, rutas fijas, Sparticuz, Puppeteer), y la activación es por configuración; no se ha modificado lógica ni arquitectura.
- **Medio por entorno:** La ejecución real depende de que Chromium esté disponible y encontrable en Railway/Docker/Linux; la ruta exacta puede variar según el stack (Nixpacks vs Docker). Configurar `PUPPETEER_EXECUTABLE_PATH` cuando la ruta no sea estándar reduce el riesgo.
- **Medio por cuenta y políticas:** Uso de credenciales AliExpress y automatización del navegador; conviene cumplir términos de uso de AliExpress y proteger secretos (variables de entorno, no en código).

---

## CONCLUSIÓN

El sistema **puede ejecutar compras reales automáticamente en producción** mediante **configuración únicamente**: variables de activación (`ALLOW_BROWSER_AUTOMATION`, `ALIEXPRESS_USER`, `ALIEXPRESS_PASS`), ausencia de `DISABLE_BROWSER_AUTOMATION=true`, y asegurar que Chromium sea encontrable (por env, rutas del sistema o `@sparticuz/chromium`). No se requieren cambios de código ni refactors para esta validación de entorno y ejecución.
