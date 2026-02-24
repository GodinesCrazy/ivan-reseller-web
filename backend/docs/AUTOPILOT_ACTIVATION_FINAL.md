# Activación real de Autopilot ? Estado final

## Objetivo alcanzado

El backend quedó configurado para que el autopilot arranque y ejecute ciclos automáticos con APIs reales (Scraping + eBay) usando variables de entorno y/o credenciales en DB.

---

## Cambios realizados (sin tocar lógica económica)

### FASE 1 ? Carga de variables de entorno
- **server.ts, autopilot-init.ts, full-bootstrap.ts:** Al inicio se carga `dotenv.config()` y `dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })`.
- En los tres archivos se imprime **`[ENV CHECK]`** con `SCRAPERAPI_KEY`, `ZENROWS_API_KEY`, `EBAY_APP_ID` (booleanos).

### FASE 2 ? api-availability.service.ts
- **ScraperAPI:** Si no hay credenciales en DB, se usa `process.env.SCRAPERAPI_KEY` como fallback.
- **ZenRows:** Si no hay credenciales en DB, se usa `process.env.ZENROWS_API_KEY` como fallback.
- **eBay:** Si no hay credenciales en DB, se construye desde `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`, `EBAY_REDIRECT_URI`.

### FASE 3 ? autopilot-init.ts
- Import: `import { autopilotSystem } from './services/autopilot.service'`.
- Tras cargar la config persistida, si **config.enabled** es true se busca el primer usuario activo con `paypalPayoutEmail` y se llama a **autopilotSystem.start(firstUser.id)**.
- Se imprime **`[AUTOPILOT_START_TRIGGERED]`** con el `id` del usuario antes de `start()`.

### FASE 4 ? autopilot.service.ts
- **start()** asigna **this.isRunning = true** y llama a **this.scheduleNextCycle()**.
- Logs: **`[AUTOPILOT_STARTED]`**, **`[AUTOPILOT] Searching opportunities`**, **`[AUTOPILOT] Publishing product`**, **`[AUTOPILOT] Cycle complete`**.

### FASE 5 ? Puerto
- **PORT:** `const PORT = Number(process.env.PORT) || 4000`.
- En **EADDRINUSE** se hace **`[PORT FIX] Switching port to 4001`** (o 4000 si el fallback era 4001) y se vuelve a llamar a `listen` en el puerto alternativo, con handler de error para evitar uncaught.

### FASE 6 ? Cache
- Ejecutado: borrado de `node_modules/.cache`, `dist`, `.turbo` (sin tocar `node_modules`).

### FASE 7 ? Prisma
- Se puede ejecutar **`npx prisma generate`** si hace falta regenerar el cliente.

### FASE 8 ? Script de verificación
- **scripts/verify-autopilot-runtime.ts** comprueba:
  - `autopilot_config.enabled`
  - Credenciales de scraping y eBay (vía `apiAvailability.getCapabilities`)
  - `autopilotSystem.getStatus().isRunning`
- Escribe en consola:
  - **AUTOPILOT_RUNNING = TRUE / FALSE**
  - **AUTOMATIC_REVENUE_GENERATION = ACTIVE / INACTIVE**
  - **SYSTEM_FULLY_OPERATIONAL = TRUE / FALSE**

---

## Cómo verificar en tu entorno

1. **Variables en .env.local**  
   Asegúrate de tener en `backend/.env.local` (o en el entorno):
   - `SCRAPERAPI_KEY` y/o `ZENROWS_API_KEY`
   - `EBAY_APP_ID`, `EBAY_DEV_ID`, `EBAY_CERT_ID`, `EBAY_REDIRECT_URI`  
   Si no están, ejecuta:  
   `npx tsx scripts/configure-apis-from-apis2.ts`

2. **Autopilot habilitado en DB**  
   `autopilot_config` en `system_configs` debe tener `enabled: true`.  
   Por ejemplo:  
   `npx tsx scripts/activate-live-profit-mode.ts`

3. **Arrancar el backend**  
   - Cierra cualquier proceso que use el puerto 4000 (o deja que use 4001 con [PORT FIX]).
   - En `backend`:  
     `npm run dev`

4. **Logs esperados**
   - `[ENV CHECK] { SCRAPERAPI_KEY: true, ZENROWS_API_KEY: true, EBAY_APP_ID: true }`
   - `[AUTOPILOT_START_TRIGGERED] <userId>`
   - `[AUTOPILOT_STARTED]`
   - `[AUTOPILOT] Searching opportunities`
   - `[AUTOPILOT] Cycle complete` (y opcionalmente `[AUTOPILOT] Publishing product` si se publica)

5. **Verificación con script**  
   Con el servidor en marcha (en otra terminal):  
   `npx tsx scripts/verify-autopilot-runtime.ts`  
   Debe mostrar **AUTOPILOT_RUNNING = TRUE**, **AUTOMATIC_REVENUE_GENERATION = ACTIVE**, **SYSTEM_FULLY_OPERATIONAL = TRUE** cuando config, credenciales y autopilot estén correctos.

---

## Criterio de finalización

Cuando el backend esté en marcha, el autopilot arrancado y las APIs configuradas:

- **AUTOPILOT_RUNNING = TRUE**
- **AUTOMATIC_REVENUE_GENERATION = ACTIVE**
- **SYSTEM_FULLY_OPERATIONAL = TRUE**

Sin simulaciones, sin mocks; solo configuración, carga de entorno y arranque del autopilot en runtime real.
