# 🎨 GUÍA: Variables de Entorno del Frontend (Vercel/Railway)

**Fecha:** 2025-01-11  
**Objetivo:** Configurar variables de entorno para el frontend en Vercel o Railway  
**Fuente:** Basado en `ENV_AUDIT_REPORT.md` y análisis del código real

---

## 📋 ÍNDICE

1. [Variables Obligatorias](#1-variables-obligatorias)
2. [Variables Opcionales](#2-variables-opcionales)
3. [Variables Definidas pero NO Usadas](#3-variables-definidas-pero-no-usadas)
4. [Configuración en Vercel](#4-configuración-en-vercel)
5. [Configuración en Railway](#5-configuración-en-railway)
6. [Verificación Post-Deploy](#6-verificación-post-deploy)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. VARIABLES OBLIGATORIAS

### 1.1 VITE_API_URL

**Propósito:** URL base del backend API. Sin esta variable, el frontend hace requests a `http://localhost:3000` (fallback).

**Valor:**
```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
```

**Dónde se usa:**
- `frontend/src/services/api.ts:4` (axios baseURL)
- `frontend/src/pages/APISettings.tsx:434` (socket.io)
- `frontend/src/hooks/useNotifications.ts:51,153` (socket.io y fetch)
- `frontend/src/pages/SystemLogs.tsx:32` (fetch)

**Código Real (frontend/src/services/api.ts:4):**
```typescript
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
```

**Ejemplo seguro:**
```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
```

**⚠️ CRÍTICO:** Esta es la **ÚNICA variable obligatoria** del frontend. Sin ella, el frontend no puede comunicarse con el backend en producción.

**Formato:**
- **Sin trailing slash:** El código hace `replace(/\/+$/, '')` para eliminar slashes finales
- **Con protocolo:** Debe incluir `https://` o `http://`
- **Sin `/api`:** No incluir `/api` al final (el código lo maneja automáticamente)

**Ejemplos correctos:**
```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
VITE_API_URL=https://api.ivanreseller.com
VITE_API_URL=http://localhost:3000  # Solo para desarrollo local
```

**Ejemplos incorrectos:**
```env
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app/  # Trailing slash (se elimina automáticamente)
VITE_API_URL=ivan-reseller-web-production.up.railway.app  # Sin protocolo
VITE_API_URL=https://ivan-reseller-web-production.up.railway.app/api  # No incluir /api
```

---

## 2. VARIABLES OPCIONALES

### 2.1 VITE_LOG_LEVEL

**Propósito:** Controla el nivel de logging en el frontend (consola del navegador)

**Valor:**
```env
VITE_LOG_LEVEL=warn
```

**Dónde se usa:**
- `frontend/src/utils/logger.ts:21` (configuración del logger)

**Código Real (frontend/src/utils/logger.ts:21):**
```typescript
let currentLevel: LogLevel = (env.VITE_LOG_LEVEL as LogLevel) || DEFAULT_LEVEL;
```

**Valores válidos:**
- `debug` - Muestra todos los logs (desarrollo)
- `info` - Muestra info, warn y error
- `warn` - Muestra warn y error (recomendado para producción)
- `error` - Solo errores
- `silent` - No muestra logs

**Default:**
- **Desarrollo:** `debug` (si `env.MODE === 'development'`)
- **Producción:** `warn` (si `env.MODE === 'production'`)

**Ejemplo seguro:**
```env
VITE_LOG_LEVEL=warn
```

**⚠️ NOTA:** Esta variable es opcional. Si no se configura, el sistema usa los valores por defecto según el modo (dev/prod).

---

## 3. VARIABLES DEFINIDAS PERO NO USADAS

### 3.1 VITE_GROQ_API_KEY

**Propósito:** API Key de GROQ (definida en tipos pero NO se usa en el código)

**Valor:**
```env
VITE_GROQ_API_KEY=CHANGEME
```

**Dónde está definida:**
- `frontend/src/vite-env.d.ts:5` (definición de tipos TypeScript)

**Dónde NO se usa:**
- No se encontró uso en el código del frontend

**Ejemplo seguro:**
```env
VITE_GROQ_API_KEY=CHANGEME
```

**⚠️ NOTA:** Esta variable está definida en los tipos pero **NO se usa actualmente**. Probablemente es legacy o para uso futuro. No es necesario configurarla.

---

## 4. CONFIGURACIÓN EN VERCEL

### 4.1 Pasos para Configurar Variables

1. **Ve a Vercel Dashboard:**
   - Abre https://vercel.com
   - Selecciona tu proyecto

2. **Ve a Settings → Environment Variables:**
   - Click en **"Settings"** en el menú lateral
   - Click en **"Environment Variables"**

3. **Agrega Variables:**
   - Click en **"Add New"**
   - **Name:** `VITE_API_URL`
   - **Value:** `https://ivan-reseller-web-production.up.railway.app` (tu URL del backend)
   - **Environments:** Selecciona todas (Production, Preview, Development) o solo Production
   - Click **"Save"**

4. **Agregar Variable Opcional (VITE_LOG_LEVEL):**
   - Click en **"Add New"**
   - **Name:** `VITE_LOG_LEVEL`
   - **Value:** `warn`
   - **Environments:** Production (opcional: Preview, Development)
   - Click **"Save"**

5. **Redeploy:**
   - **IMPORTANTE:** Después de agregar/modificar variables, debes hacer un redeploy
   - Ve a **"Deployments"**
   - Click en el menú (⋯) del deployment más reciente
   - Click **"Redeploy"**
   - O haz un nuevo commit/push para trigger automático

### 4.2 Cuándo Requiere Redeploy

**✅ Requiere redeploy:**
- Agregar nueva variable
- Modificar valor de variable existente
- Cambiar environments de una variable

**❌ NO requiere redeploy:**
- Variables ya configuradas se incluyen automáticamente en nuevos builds

**⚠️ IMPORTANTE:** Las variables de Vite (`VITE_*`) se inyectan en tiempo de **build**, no en runtime. Por lo tanto, cualquier cambio requiere un nuevo build (redeploy).

### 4.3 Verificación en Vercel

**1. Verificar Variables Configuradas:**
- Ve a **Settings → Environment Variables**
- Verifica que `VITE_API_URL` esté listada
- Verifica que el valor sea correcto

**2. Verificar en Build Logs:**
- Ve a **Deployments** → Click en un deployment
- Ve a la pestaña **"Build Logs"**
- Busca mensajes de build (no debería haber errores relacionados con variables)

**3. Verificar en Runtime:**
- Abre la URL de tu frontend desplegado
- Abre consola del navegador (F12)
- Ejecuta: `console.log(import.meta.env.VITE_API_URL)`
- Debe mostrar la URL del backend

---

## 5. CONFIGURACIÓN EN RAILWAY

### 5.1 Pasos para Configurar Variables

1. **Ve a Railway Dashboard:**
   - Abre https://railway.app
   - Selecciona tu proyecto
   - Click en el servicio del **frontend**

2. **Ve a Variables:**
   - Click en la pestaña **"Variables"**

3. **Agrega Variables:**
   - Click en **"New Variable"** o **"Raw Editor"**
   - Agrega:
     ```
     VITE_API_URL=https://ivan-reseller-web-production.up.railway.app
     ```
   - (Opcional) Agrega:
     ```
     VITE_LOG_LEVEL=warn
     ```
   - Click **"Save"**

4. **Redeploy:**
   - Railway se redesplegará automáticamente después de guardar
   - Espera a que el deployment termine

### 5.2 Cuándo Requiere Redeploy

**✅ Requiere redeploy:**
- Agregar nueva variable
- Modificar valor de variable existente
- Railway hace redeploy automáticamente al guardar

**⚠️ IMPORTANTE:** Al igual que en Vercel, las variables de Vite se inyectan en tiempo de **build**, no en runtime. Railway hace redeploy automáticamente, pero puede tardar unos minutos.

### 5.3 Verificación en Railway

**1. Verificar Variables Configuradas:**
- Ve a **Variables**
- Verifica que `VITE_API_URL` esté listada
- Verifica que el valor sea correcto

**2. Verificar en Deploy Logs:**
- Ve a **Deployments** → Click en el deployment más reciente
- Ve a la pestaña **"Logs"**
- Busca mensajes de build (no debería haber errores)

**3. Verificar en Runtime:**
- Abre la URL de tu frontend desplegado
- Abre consola del navegador (F12)
- Ejecuta: `console.log(import.meta.env.VITE_API_URL)`
- Debe mostrar la URL del backend

---

## 6. VERIFICACIÓN POST-DEPLOY

### 6.1 Verificación en Consola del Navegador

**1. Abrir Frontend:**
- Abre tu URL de frontend (Vercel o Railway)
- Abre consola del navegador (F12)

**2. Verificar Variable:**
```javascript
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
```

**Respuesta esperada:**
```
VITE_API_URL: https://ivan-reseller-web-production.up.railway.app
```

**Si muestra `undefined` o `http://localhost:3000`:**
- ❌ La variable no está configurada o el build no la incluyó
- ✅ Verifica que la variable esté en Vercel/Railway
- ✅ Haz un redeploy

**3. Verificar Requests:**
- Ve a la pestaña **"Network"** en la consola
- Intenta hacer login o cualquier acción que llame al backend
- Verifica que las requests vayan a la URL correcta del backend
- **Ejemplo:** `https://ivan-reseller-web-production.up.railway.app/api/auth/login`

**Si las requests van a `http://localhost:3000`:**
- ❌ `VITE_API_URL` no está configurada o el build no la incluyó
- ✅ Verifica que la variable esté en Vercel/Railway
- ✅ Haz un redeploy

### 6.2 Verificación de CORS

**1. Probar Request desde Frontend:**
```javascript
fetch('https://ivan-reseller-web-production.up.railway.app/api/auth/me', {
  credentials: 'include'
})
.then(r => {
  console.log('CORS OK:', r.status);
  return r.json();
})
.catch(e => console.error('CORS Error:', e));
```

**Si hay error de CORS:**
- ❌ `CORS_ORIGIN` en Railway (backend) no incluye la URL del frontend
- ✅ Verifica `RAILWAY_ENV_SETUP.md` sección 5 para configurar `CORS_ORIGIN`

### 6.3 Checklist Completo

- [ ] `VITE_API_URL` configurada en Vercel/Railway
- [ ] `VITE_LOG_LEVEL` configurada (opcional, recomendado: `warn`)
- [ ] Redeploy completado después de agregar/modificar variables
- [ ] `import.meta.env.VITE_API_URL` muestra la URL correcta en consola
- [ ] Requests del frontend van a la URL correcta del backend (verificar en Network tab)
- [ ] No hay errores de CORS
- [ ] Login funciona end-to-end

---

## 7. TROUBLESHOOTING

### 7.1 Variable No Se Inyecta

**Síntoma:** `import.meta.env.VITE_API_URL` muestra `undefined` o el valor por defecto

**Causas posibles:**
1. Variable no está configurada en Vercel/Railway
2. Variable tiene nombre incorrecto (debe empezar con `VITE_`)
3. Build se hizo antes de configurar la variable
4. Variable está en environment incorrecto (ej: Production vs Preview)

**Solución:**
1. Verifica que la variable esté en Vercel/Railway → Settings → Environment Variables
2. Verifica que el nombre sea exactamente `VITE_API_URL` (case-sensitive)
3. Haz un redeploy después de configurar la variable
4. Verifica que la variable esté en el environment correcto (Production, Preview, Development)

### 7.2 Requests Van a localhost

**Síntoma:** Las requests del frontend van a `http://localhost:3000` en lugar del backend real

**Causa:** `VITE_API_URL` no está configurada o el build no la incluyó

**Solución:**
1. Verifica que `VITE_API_URL` esté configurada en Vercel/Railway
2. Verifica que el valor sea correcto (URL completa con `https://`)
3. Haz un redeploy
4. Verifica en consola: `console.log(import.meta.env.VITE_API_URL)`

### 7.3 Error de CORS

**Síntoma:** Requests fallan con error de CORS en la consola

**Causa:** `CORS_ORIGIN` en Railway (backend) no incluye la URL del frontend

**Solución:**
1. Ve a Railway Dashboard → Backend → Variables
2. Busca `CORS_ORIGIN`
3. Agrega la URL del frontend (separada por comas)
4. Guarda y espera el redeploy del backend
5. Verifica `RAILWAY_ENV_SETUP.md` sección 5 para formato correcto

### 7.4 Build Falla

**Síntoma:** Build en Vercel/Railway falla

**Causas posibles:**
1. Error de sintaxis en código
2. Dependencias faltantes
3. Variables mal formateadas (raro)

**Solución:**
1. Revisa los logs de build en Vercel/Railway
2. Verifica que no haya errores de TypeScript/ESLint
3. Verifica que todas las dependencias estén en `package.json`
4. Si el error menciona variables, verifica el formato (deben ser strings simples)

---

## 📚 REFERENCIAS

- **Reporte Completo:** `ENV_AUDIT_REPORT.md`
- **Configuración Backend:** `RAILWAY_ENV_SETUP.md`
- **Vite Documentation:** https://vitejs.dev/guide/env-and-mode.html

---

## 🔍 CÓDIGO DE REFERENCIA

### frontend/src/services/api.ts
```typescript
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
```

### frontend/src/utils/logger.ts
```typescript
let currentLevel: LogLevel = (env.VITE_LOG_LEVEL as LogLevel) || DEFAULT_LEVEL;
```

### frontend/src/vite-env.d.ts
```typescript
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GROQ_API_KEY: string
}
```

---

**Fin del Documento**

