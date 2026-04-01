# Scraper Bridge — Minimal Manual Steps

**Date:** 2026-04-01  
**Context:** ML search bloqueado comprehensivamente. Pasos mínimos para desbloquear competitor data.

---

## OPCIÓN A — Reconectar eBay OAuth (5 minutos) ⭐ RECOMENDADA

eBay NO está IP-bloqueado desde Railway. Solo el token está expirado.

### Pasos exactos:
1. Ir a `https://ivan-reseller-backend-production.up.railway.app` (o tu dominio)
2. Login como admin
3. Settings → Marketplaces → eBay
4. Click "Reconectar" o "Refresh OAuth"
5. Autorizar en eBay Developer portal
6. Verificar: `GET /api/opportunities?query=bluetooth+earbuds&region=us&marketplaces=ebay`
   - Debe retornar items con `listingsFound > 0`
7. Correr Cycle 5 con `marketplaces=ebay&region=us`

### Resultado esperado:
- `MARKETPLACE_SEARCH_ERROR` → `EBAY_ZERO_RESULTS` o directo a comparables
- Si eBay devuelve ≥3 listings → `PUBLICABLE: true`

---

## OPCIÓN B — Configurar ScraperAPI key en Railway (10 minutos)

### Requisito: cuenta ScraperAPI activa con créditos

### Pasos exactos:
1. Ir a [app.scraperapi.com](https://app.scraperapi.com) → copiar tu API key
2. Ir a [Railway dashboard](https://railway.app) → proyecto `ivan-reseller` → servicio `ivan-reseller-backend`
3. Variables tab → agregar:
   ```
   SCRAPERAPI_KEY = <tu_api_key>
   ```
4. Redeploy (automático al guardar variable)
5. Esperar ~3 minutos para que depliegue
6. Correr Cycle 5 con `marketplaces=mercadolibre&region=cl`

### Verificación:
```bash
curl "https://ivan-reseller-backend-production.up.railway.app/api/opportunities?query=auriculares+bluetooth&region=cl&marketplaces=mercadolibre&maxItems=3" \
  -H "Cookie: token=<jwt>"
# Esperar: listingsFound > 0 y decision: PUBLICABLE
```

---

## OPCIÓN C — Configurar ZenRows key en Railway (10 minutos)

### Requisito: cuenta ZenRows activa

### Pasos exactos:
1. Ir a [app.zenrows.com](https://app.zenrows.com) → copiar API key
2. Railway → backend → Variables → agregar:
   ```
   ZENROWS_API_KEY = <tu_api_key>
   ```
3. Redeploy automático
4. Correr Cycle 5

### Por qué ZenRows puede ser más efectivo que ScraperAPI:
- ZenRows `premium_proxy=true` usa proxies residenciales
- Mayor probabilidad de bypass de bloqueos comprehensivos
- Si ML solo bloquea datacenter IPs, ZenRows residencial funcionaría

---

## OPCIÓN D — Deploy scraper-bridge en plataforma edge (30–60 minutos)

### Mejor opción técnica para ML Chile a largo plazo

### Render.com (gratis):
1. Ir a [render.com](https://render.com) → New → Web Service
2. Conectar repo `GodinesCrazy/ivan-reseller-web`
3. Root directory: `scraper-bridge`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add env var: `SCRAPERAPI_KEY=<key>` o `ZENROWS_API_KEY=<key>`
7. Deploy → obtener URL pública
8. En Railway backend, agregar:
   ```
   SCRAPER_BRIDGE_ENABLED = true
   SCRAPER_BRIDGE_URL = https://tu-bridge.onrender.com
   ```

### Vercel Edge (alternativa):
- Limitado: solo funciones edge, no servidor Express continuo
- No recomendado para este bridge

---

## OPCIÓN E — Activar scraper-bridge en Railway (no resuelve ML block)

⚠️ **NO RECOMENDADO** para ML search — Railway IPs están bloqueadas igual.

Si se activa con `SCRAPERAPI_KEY` configurado, el bridge usaría ScraperAPI como proxy y SERÍA equivalente a la Opción B. Solo tiene sentido si se quiere la ruta scraper-bridge + ScraperAPI combinados.

---

## Verificación post-fix

Después de cualquier opción, verificar:

```bash
PROD_URL="https://ivan-reseller-backend-production.up.railway.app"
# Obtener JWT
JWT=$(curl -si -X POST "$PROD_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep "set-cookie" | grep -o "token=[^;]*" | cut -d= -f2-)

# Correr ciclo de verificación
curl -s "$PROD_URL/api/opportunities?query=auriculares+bluetooth&region=cl&marketplaces=mercadolibre&maxItems=3" \
  -H "Cookie: token=$JWT" | \
  node -e "
const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(c));
  (d.items||[]).forEach(it=>{
    const pd=it.publishingDecision||{};
    const cd=(it.competitionDiagnostics||[])[0]||{};
    console.log(it.title?.substring(0,40), pd.decision, 'listings:', cd.listingsFound);
  });
});"
```

**Criterio de éxito:** al menos 1 item con `decision: PUBLICABLE` y `canPublish: true`
