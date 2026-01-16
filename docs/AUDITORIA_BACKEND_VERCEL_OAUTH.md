# 🔍 AUDITORÍA BACKEND VERCEL + OAUTH ALIEXPRESS

**Fecha:** 2025-01-26  
**Auditor:** Lead Backend Architect (Vercel/Next.js/OAuth Specialist)  
**Repositorio:** https://github.com/GodinesCrazy/ivan-reseller-web.git

---

## === ESTADO DEL BACKEND ===

**NO EXISTE**

**Explicación:**
- ❌ No existe `/api/aliexpress/callback.ts`
- ❌ No existe `/api/aliexpress/callback.js`
- ❌ No existe carpeta `/api/` en raíz del repo
- ❌ No existe carpeta `/api/` en `frontend/`
- ❌ Este proyecto **NO usa funciones serverless de Vercel**

**Arquitectura Real:**
- Frontend: React + Vite (NO Next.js)
- Backend: Node.js + Express en Railway (NO en Vercel)
- Comunicación: `vercel.json` con rewrites que redirigen `/api/*` y `/aliexpress/callback` al backend de Railway

---

## === ESTADO DEL CALLBACK OAUTH ===

**INEXISTENTE en Vercel / FUNCIONAL en Railway**

**Análisis Detallado:**

### 1. Callback en Backend Railway (EXISTE y FUNCIONAL)

**Ubicación:** `backend/src/api/routes/marketplace-oauth.routes.ts`

**Ruta registrada:**
```typescript
// backend/src/app.ts:875
app.use('/aliexpress', marketplaceOauthRoutes);

// marketplace-oauth.routes.ts:70
router.get('/callback', async (req: Request, res: Response) => {
  // Ruta final: /aliexpress/callback
```

**Implementación (Líneas 70-265):**
- ✅ Manejo de parámetro `code`: Línea 79 (`const { code } = req.query`)
- ✅ Manejo de parámetro `state`: Línea 79 (`const { state } = req.query`)
- ✅ Validación de parámetros: Líneas 131-158
- ✅ Parseo y validación de `state`: Línea 162 (`parseState(stateStr)`)
- ✅ Token exchange: Línea 265 (`exchangeCodeForToken()`)
- ✅ Persistencia de tokens: Línea 306 (`saveCredentials()`)
- ✅ Manejo de errores: Líneas 396-438
- ✅ Respuesta HTTP correcta: JSON (200) o HTML de error (400/500)
- ✅ Smoke test mode: Líneas 99-112 (responde JSON cuando `code=test&state=test`)

**Veredicto Backend:** ✅ **FUNCIONAL Y COMPLETO**

### 2. Callback en Vercel (NO EXISTE)

**Problema:**
- ❌ No existe función serverless de Vercel
- ❌ `vercel.json` tiene rewrite que **NO se está aplicando**
- ❌ Vercel devuelve SPA React (`index.html`) en lugar de redirigir a Railway

**Evidencia:**
- Smoke test: `isSPA: true` → Callback devuelve HTML del SPA
- Backend directo: Funciona correctamente (`curl` a Railway responde JSON)

**Veredicto Vercel:** ❌ **INEXISTENTE / NO FUNCIONAL**

### 3. Frontend NO intercepta la ruta

**Verificación:**
- ✅ `frontend/src/App.tsx`: NO tiene ruta para `/aliexpress/callback`
- ✅ `frontend/src/App.tsx:234`: Catch-all `path="*"` redirige a `/`, pero esto NO se ejecuta si Vercel aplicara el rewrite correctamente
- ✅ React Router NO intercepta porque el rewrite debería ocurrir ANTES de que el request llegue al frontend

**Veredicto:** ✅ Frontend NO intercepta (correcto)

---

## === PROBLEMAS CRÍTICOS ===

### 1. ❌ FALTA FUNCIÓN SERVERLESS DE VERCEL (Arquitectura Incorrecta)

**Problema:**
El proyecto intenta usar `vercel.json` rewrites para redirigir `/aliexpress/callback` al backend de Railway, pero:
- Vercel rewrites pueden no funcionar correctamente para OAuth callbacks
- El rewrite NO se está aplicando (evidencia: devuelve SPA React)
- OAuth callbacks requieren respuesta HTTP inmediata, no proxy/rewrite

**Causa Raíz:**
Arquitectura híbrida (Vercel frontend + Railway backend) con rewrites es frágil para OAuth. Vercel debería tener una función serverless que maneje el callback directamente.

### 2. ❌ VERCEL.JSON REWRITE NO SE APLICA

**Evidencia:**
```json
// vercel.json existe y está correcto
{
  "source": "/aliexpress/callback",
  "destination": "https://ivan-reseller-web-production.up.railway.app/aliexpress/callback"
}
```

Pero:
- Smoke test muestra que devuelve SPA React
- El rewrite debería ejecutarse ANTES del catch-all `/(.*)`, pero no lo hace

**Posibles causas:**
1. Root Directory en Vercel Dashboard incorrecto (debe estar vacío)
2. Configuración en Vercel Dashboard sobrescribe `vercel.json`
3. Cache de Edge Functions
4. Deploy no incluyó cambios en `vercel.json`

### 3. ⚠️ ARQUITECTURA NO ÓPTIMA PARA OAUTH

**Problema:**
OAuth callbacks deben:
- Responder rápidamente (timeout de AliExpress)
- No depender de proxy/rewrite (puede fallar)
- Estar en el mismo dominio (cookies/state)

**Solución Recomendada:**
Crear función serverless de Vercel que maneje el callback directamente (mejor que rewrite).

---

## === QUÉ FALTA PARA TERMINAR EL SOFTWARE ===

### 1. CREAR FUNCIÓN SERVERLESS DE VERCEL (RECOMENDADO)

**Acción:** Crear `/api/aliexpress/callback.ts` (o `.js`)

**Ubicación:** Raíz del repo (al mismo nivel que `vercel.json`)

**Implementación:**
```typescript
// api/aliexpress/callback.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;

  // Smoke test mode
  if (code === 'test' && state === 'test') {
    return res.status(200).json({
      success: true,
      mode: 'smoke_test',
      message: 'callback reached vercel serverless function',
    });
  }

  // Proxy al backend de Railway
  try {
    const railwayUrl = process.env.RAILWAY_BACKEND_URL || 
                      'https://ivan-reseller-web-production.up.railway.app';
    const response = await fetch(
      `${railwayUrl}/aliexpress/callback?${new URLSearchParams(req.query as Record<string, string>).toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.text();
    
    // Preservar status code y headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    // Si es JSON, parsearlo; si no, enviar como texto
    try {
      const json = JSON.parse(data);
      return res.json(json);
    } catch {
      return res.send(data);
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
```

**Ventajas:**
- ✅ Más confiable que rewrites
- ✅ Control total sobre la respuesta
- ✅ No depende de configuración de Vercel Dashboard
- ✅ Funciona siempre

### 2. VERIFICAR Y CORREGIR CONFIGURACIÓN DE VERCEL (ALTERNATIVA)

**Si se prefiere usar rewrites en vez de función serverless:**

1. Verificar Root Directory en Vercel Dashboard:
   - Settings → Build and Deployment → Root Directory
   - **Debe estar VACÍO** (no `frontend`, no `./`)

2. Eliminar rewrites duplicados en Dashboard:
   - Settings → Rewrites (si existe)
   - Eliminar todos los rewrites configurados
   - Vercel debe usar SOLO `vercel.json`

3. Forzar redeploy:
   ```bash
   git commit --allow-empty -m "chore: force vercel redeploy"
   git push origin main
   ```

4. Validar con smoke test:
   ```bash
   npm run smoke:prod
   ```

### 3. VALIDAR OAUTH COMPLETO EN PRODUCCIÓN

**Después de resolver el callback:**
1. Completar flujo OAuth real (no smoke test)
2. Verificar que tokens se guardan
3. Probar llamada real a AliExpress Dropshipping API

---

## === CONCLUSIÓN FINAL ===

**ESTADO ACTUAL:** ❌ **NO LISTO PARA PRODUCCIÓN**

**Razón:** 
El callback OAuth de AliExpress NO funciona porque:
1. No existe función serverless de Vercel (arquitectura incorrecta)
2. El rewrite de `vercel.json` NO se está aplicando
3. Vercel devuelve SPA React en lugar de llegar al backend

**SOLUCIÓN REQUERIDA:**
Crear función serverless de Vercel en `/api/aliexpress/callback.ts` que actúe como proxy al backend de Railway, O verificar/corregir la configuración de Vercel para que aplique el rewrite correctamente.

**TIEMPO ESTIMADO:** 30-60 minutos (crear función serverless) o 15-30 minutos (corregir configuración)

**PRIORIDAD:** 🔴 **CRÍTICA** (bloquea producción)

