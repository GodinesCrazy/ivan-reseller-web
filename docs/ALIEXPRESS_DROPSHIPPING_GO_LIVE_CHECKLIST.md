# ✅ ALIEXPRESS DROPSHIPPING OAUTH - GO-LIVE CHECKLIST

**Fecha:** [FECHA]  
**Objetivo:** Validar que el OAuth de AliExpress Dropshipping funciona correctamente en producción  
**Estado:** 📋 CHECKLIST PRE-VALIDACIÓN

---

## 📋 PRE-REQUISITOS

### Verificaciones Previas

- [ ] **Smoke test ejecutado y pasado:**
  ```bash
  npm run smoke:prod
  ```
  - [ ] Todos los endpoints críticos responden correctamente
  - [ ] No hay errores 502 en `/api/*`
  - [ ] El callback `/aliexpress/callback` llega al backend

- [ ] **Deploy completado:**
  - [ ] Vercel deploy exitoso (verificar en Vercel Dashboard)
  - [ ] Railway deploy exitoso (verificar en Railway Dashboard)
  - [ ] vercel.json incluye el rewrite para `/aliexpress/callback`

- [ ] **Configuración de AliExpress App Console:**
  - [ ] Callback URL configurado: `https://www.ivanreseller.com/aliexpress/callback` (⚠️ usar www, no sin www)
  - [ ] App Key (Client ID) obtenido
  - [ ] App Secret obtenido

- [ ] **Confirmar dominio canónico (www):**
  - [ ] El callback URL en AliExpress App Console usa `www.ivanreseller.com` (no `ivanreseller.com`)
  - [ ] Variable `WEB_BASE_URL` en Railway está configurada como `https://www.ivanreseller.com` (o sin configurar para usar default)
  - [ ] Esto previene saltos de dominio que pueden causar pérdida de cookies/state durante OAuth

- [ ] **Credenciales guardadas en el sistema:**
  - [ ] Ir a `https://ivanreseller.com/api-settings`
  - [ ] Buscar "AliExpress Dropshipping API"
  - [ ] Verificar que App Key y App Secret están guardados
  - [ ] Verificar que el ambiente (Production/Sandbox) está correcto

---

## 🧪 PASO 1: EJECUTAR SMOKE TEST

### Comando:
```bash
npm run smoke:prod
```

**Nota:** El script genera automáticamente:
- `docs/_smoke/last-smoke.json` - Resultados en formato JSON (machine-readable)
- `docs/ALIEXPRESS_DROPSHIPPING_OAUTH_PROD_VALIDATION_REPORT.FILLED.md` - Reporte de validación auto-completado

**Revisar el reporte FILLED para ver el análisis detallado y la recomendación (GO/HOLD/NO-GO).**

**Significado de GO vs HOLD vs NO-GO:**
- ✅ **GO**: Todo funciona correctamente. Puedes proceder con validación OAuth completa.
- ⚠️ **HOLD**: Problemas menores detectados. Necesita fix antes de proceder con validación completa.
- ❌ **NO-GO**: Problemas críticos detectados. NO proceder hasta resolver (ej: 502 en endpoints críticos, callback devolviendo SPA).

**Nota sobre redirects:**
- El smoke test ahora sigue redirects automáticamente (ej: ivanreseller.com → www.ivanreseller.com)
- Evalúa el resultado FINAL después de redirects
- Muestra la cadena de redirects en los logs y en el reporte JSON

**Exit code:**
- `0` = Todos los tests pasaron (PASS)
- `1` = Al menos un test crítico falló (FAIL)

### Resultados Esperados:

- [ ] `/api/health` → Status 200
- [ ] `/api/auth-status` → Status 200, 401, o 403 (NO 502)
- [ ] `/api/dashboard/stats` → Status 200, 401, o 403 (NO 502)
- [ ] `/api/products` → Status 200, 401, o 403 (NO 502)
- [ ] `/aliexpress/callback?code=test&state=test` → Status 200-499 (NO 502, NO 404)
- [ ] `/api/marketplace-oauth/aliexpress/oauth/debug` → Status 200 o 401 (NO 502)

### Si hay 502:
- [ ] Revisar `docs/API_502_ROOTCAUSE_AND_FIX.md`
- [ ] Aplicar fix mínimo si es inequívoco
- [ ] Re-ejecutar smoke test
- [ ] NO proceder hasta que los 502 estén resueltos

---

## 🧪 PASO 2: VERIFICAR CALLBACK LLEGA AL BACKEND

### Test Manual del Callback:

1. **Abrir en navegador:**
   ```
   https://ivanreseller.com/aliexpress/callback?code=test&state=test
   ```

2. **Resultado esperado:**
   - [ ] NO muestra la página del SPA React (index.html)
   - [ ] Muestra respuesta del backend (puede ser error 400, pero debe ser del backend)
   - [ ] Puede mostrar HTML con mensaje de error (esperado para code/state inválidos)
   - [ ] NO muestra 404 Not Found

3. **Si muestra el SPA React o 404:**
   - [ ] Verificar que vercel.json tiene el rewrite correcto
   - [ ] Verificar que el deploy de Vercel fue exitoso
   - [ ] Revisar logs de Vercel para ver errores de rewrite

---

## 🧪 PASO 3: COMPLETAR FLUJO OAUTH EN UI (MANUAL)

### Pasos:

1. **Navegar a API Settings:**
   - [ ] Abrir `https://ivanreseller.com/api-settings`
   - [ ] Iniciar sesión si es necesario

2. **Encontrar AliExpress Dropshipping API:**
   - [ ] Buscar la sección "AliExpress Dropshipping API"
   - [ ] Verificar que muestra estado actual (probablemente "No autorizado" o "Paso 1/2")

3. **Guardar credenciales base (si no están):**
   - [ ] Ingresar App Key (Client ID)
   - [ ] Ingresar App Secret
   - [ ] Seleccionar ambiente (Production/Sandbox)
   - [ ] Hacer click en "Guardar" o "Save"
   - [ ] Verificar que se guardó correctamente

4. **Iniciar OAuth:**
   - [ ] Hacer click en "Autorizar OAuth" o botón similar
   - [ ] Verificar que se abre una nueva ventana/pestaña con AliExpress
   - [ ] Verificar que la URL de AliExpress contiene los parámetros correctos

5. **Autorizar en AliExpress:**
   - [ ] Completar el proceso de autorización en AliExpress
   - [ ] Verificar que AliExpress redirige de vuelta a `https://ivanreseller.com/aliexpress/callback?code=...&state=...`

6. **Verificar callback se procesa:**
   - [ ] Verificar que el callback no muestra error 404 o página del SPA
   - [ ] Verificar que muestra mensaje de éxito o redirige correctamente
   - [ ] Verificar que la ventana se cierra o muestra mensaje de éxito

7. **Verificar estado en UI:**
   - [ ] Volver a la página de API Settings
   - [ ] Verificar que AliExpress Dropshipping API ahora muestra estado "Autorizado" o "Paso 2/2"
   - [ ] Verificar que no hay mensajes de error

---

## 🧪 PASO 4: CONFIRMAR TOKENS GUARDADOS

### Método 1: Endpoint de Debug

**Comando:**
```bash
curl https://ivanreseller.com/api/marketplace-oauth/aliexpress/oauth/debug
```

**Resultado esperado (sin autenticación):**
```json
{
  "callbackReachable": true,
  "hasTokens": false,
  "status": "not_authenticated",
  "message": "User not authenticated..."
}
```

**Resultado esperado (con autenticación - requiere cookie/sesión):**
```json
{
  "callbackReachable": true,
  "hasTokens": true,
  "hasTokensProduction": true,
  "environment": "production",
  "status": "authorized"
}
```

- [ ] Endpoint responde correctamente (NO 502)
- [ ] Si estás autenticado, `hasTokens` debería ser `true` después del OAuth

---

### Método 2: Endpoint auth-status

**En el navegador (autenticado):**
- [ ] Ir a `https://ivanreseller.com/api-settings`
- [ ] Abrir DevTools → Network
- [ ] Buscar request a `/api/auth-status`
- [ ] Verificar que la respuesta incluye información de AliExpress

**O usando curl (con cookie de sesión):**
```bash
curl -b "cookies.txt" https://ivanreseller.com/api/auth-status
```

- [ ] La respuesta incluye estado de AliExpress
- [ ] El estado indica que está autorizado

---

## 🔍 PASO 5: REVISAR LOGS EN RAILWAY

### Logs a Revisar:

1. **Logs del Callback:**
   - [ ] Railway Dashboard → Logs
   - [ ] Buscar: `[OAuth Callback] Direct AliExpress callback received`
   - [ ] Verificar que se recibió el callback
   - [ ] Buscar: `[OAuth Callback] AliExpress Dropshipping token exchange successful`
   - [ ] Verificar que el intercambio de tokens fue exitoso
   - [ ] Buscar: `[OAuth Callback] AliExpress Dropshipping credentials saved successfully`
   - [ ] Verificar que los tokens se guardaron

2. **Logs de Errores:**
   - [ ] Buscar errores relacionados con OAuth
   - [ ] Buscar errores relacionados con token exchange
   - [ ] Buscar errores relacionados con guardado de credenciales

3. **Logs de Inicio del Servidor:**
   - [ ] Verificar que el servidor inició correctamente
   - [ ] Verificar que está escuchando en `0.0.0.0` y el PORT correcto
   - [ ] Verificar que no hay errores críticos

---

## ✅ VALIDACIÓN FINAL

### Checklist de Validación:

- [ ] **Smoke test pasa:**
  - [ ] Todos los endpoints críticos responden
  - [ ] No hay errores 502

- [ ] **Callback funciona:**
  - [ ] El callback llega al backend
  - [ ] No muestra 404 o SPA React

- [ ] **OAuth completo:**
  - [ ] Flujo OAuth se completa exitosamente
  - [ ] Estado en UI muestra "Autorizado" o "Paso 2/2"

- [ ] **Tokens guardados:**
  - [ ] Endpoint de debug confirma tokens guardados
  - [ ] Logs confirman que tokens se guardaron

- [ ] **Sin errores:**
  - [ ] No hay errores en logs de Railway
  - [ ] No hay errores en consola del navegador

---

## 🎯 RESULTADO FINAL

**Estado:**
- [ ] ✅ **ÉXITO** - OAuth funciona correctamente, lista para producción
- [ ] ⚠️ **PARCIAL** - Funciona pero hay problemas menores a resolver
- [ ] ❌ **FALLO** - No funciona, necesita más investigación

**Notas:**
[NOTAS_ADICIONALES]

**Próximos pasos:**
[SIGUIENTE_ACCION]

---

## 🔄 ROLLBACK (si es necesario)

Si algo sale mal y necesitas revertir:

1. **Revertir cambios en vercel.json:**
   ```bash
   git revert [COMMIT_HASH]
   git push
   ```

2. **O manualmente editar vercel.json:**
   - Remover el rewrite de `/aliexpress/callback`
   - Hacer commit y push
   - Esperar redeploy de Vercel

**Nota:** El endpoint de diagnóstico en el backend es opcional y no afecta funcionalidad existente, así que no es necesario revertirlo.

