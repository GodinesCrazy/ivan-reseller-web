# ✅ GO-LIVE CHECKLIST - USUARIO/ADMIN

**Versión:** v1.0.0  
**Fecha:** 2025-01-26

---

## 🎯 OBJETIVO

Este checklist guía al usuario/admin a través del proceso de go-live, desde el primer login hasta la validación completa del sistema.

---

## 📋 CHECKLIST PASO A PASO

### 1️⃣ LOGIN INICIAL

**Acción:**
- Ir a `https://www.ivanreseller.com/login`
- Ingresar credenciales de admin
- Hacer clic en "Iniciar Sesión"

**Señales de Éxito:**
- ✅ Login exitoso sin errores
- ✅ Redirección automática (NO a dashboard directamente si setup incompleto)
- ✅ Sin popups de error 502
- ✅ Sin warnings en consola del navegador

**Señales de Error:**
- ❌ Error 401 (credenciales incorrectas)
- ❌ Error 500 (problema del servidor)
- ❌ Popup "Backend no disponible (502)" → Verificar Railway

**Si hay error 502:**
1. Verificar que Railway backend está activo
2. Verificar logs de Railway
3. Ejecutar `npm run smoke:prod` para diagnóstico

---

### 2️⃣ PANTALLA DE SETUP

**Cuándo aparece:**
- Aparece automáticamente si el setup no está completo
- Ruta: `/setup-required`

**Qué ver:**
- Pantalla con título "Configuración Requerida"
- Lista de qué falta configurar:
  - Marketplace (eBay, Amazon o MercadoLibre)
  - API de Búsqueda (AliExpress Affiliate, ScraperAPI o ZenRows)
- Botón "Configurar APIs"
- Botón "Verificar de nuevo"

**Señales de Éxito:**
- ✅ Pantalla se muestra claramente
- ✅ Mensaje es claro y entendible
- ✅ Botones funcionan correctamente

**Señales de Error:**
- ❌ Pantalla no aparece cuando debería (setup incompleto)
- ❌ Pantalla aparece cuando no debería (setup completo)
- ❌ Botones no funcionan

**Si setup está completo:**
- Sistema redirige automáticamente a `/dashboard`
- No se muestra pantalla de setup

---

### 3️⃣ CONFIGURACIÓN DE APIs

**Acción:**
- Hacer clic en "Configurar APIs"
- Ser redirigido a `/api-settings`

**Configurar Marketplace (Mínimo 1):**
1. Seleccionar uno de:
   - eBay Trading API
   - Amazon SP-API
   - MercadoLibre API
2. Ingresar credenciales requeridas
3. Hacer clic en "Guardar"
4. Verificar que aparece "✅ Configurado"

**Configurar API de Búsqueda (Mínimo 1):**
1. Seleccionar uno de:
   - AliExpress Affiliate API
   - ScraperAPI
   - ZenRows API
2. Ingresar credenciales requeridas
3. Hacer clic en "Guardar"
4. Verificar que aparece "✅ Configurado"

**Señales de Éxito:**
- ✅ Credenciales se guardan correctamente
- ✅ Estado cambia a "✅ Configurado"
- ✅ No hay errores al guardar
- ✅ Puede probar conexión (si está disponible)

**Señales de Error:**
- ❌ Error al guardar credenciales
- ❌ Estado no cambia a "✅ Configurado"
- ❌ Error 502 al guardar → Verificar Railway
- ❌ Error de validación → Verificar formato de credenciales

**Después de configurar:**
- Volver a `/setup-required`
- Hacer clic en "Verificar de nuevo"
- Sistema debe redirigir automáticamente a `/dashboard`

---

### 4️⃣ VALIDACIÓN OAUTH (AliExpress Dropshipping)

**Acción:**
- Ir a `/api-settings`
- Buscar "AliExpress Dropshipping API"
- Hacer clic en "Autorizar OAuth" o botón similar

**Flujo Esperado:**
1. Se abre ventana popup o redirige a AliExpress
2. Usuario autoriza en AliExpress
3. Redirige de vuelta a `https://www.ivanreseller.com/api/aliexpress/callback`
4. Muestra página de éxito o cierra popup automáticamente
5. Estado cambia a "✅ Conectado" o "Paso 2/2 completado"

**Señales de Éxito:**
- ✅ Popup se abre correctamente
- ✅ Redirección funciona
- ✅ No hay error 404 o 502 en callback
- ✅ Estado cambia a conectado
- ✅ Tokens se guardan correctamente

**Señales de Error:**
- ❌ Error 404 en callback → Verificar `vercel.json` y serverless function
- ❌ Error 502 en callback → Verificar Railway backend
- ❌ Error "invalid_redirect_uri" → Verificar Redirect URI en AliExpress App Console
- ❌ Popup no se abre → Verificar bloqueador de popups

**Si hay error:**
1. Verificar Redirect URI en AliExpress App Console: `https://www.ivanreseller.com/api/aliexpress/callback`
2. Ejecutar `npm run smoke:prod` para diagnóstico
3. Verificar logs de Vercel y Railway

---

### 5️⃣ CARGA DE DASHBOARD

**Acción:**
- Ir a `/dashboard` (o ser redirigido automáticamente)

**Qué ver:**
- Estadísticas principales:
  - Total de ventas
  - Ganancia total
  - Productos activos
  - Oportunidades totales
- Actividad reciente
- Widgets de IA (si está configurado)
- Sin errores visibles

**Señales de Éxito:**
- ✅ Dashboard carga correctamente
- ✅ Estadísticas se muestran (pueden ser 0 si no hay datos)
- ✅ No hay errores 502
- ✅ No hay popups de error
- ✅ Actividad reciente se muestra (puede estar vacía)

**Señales de Error:**
- ❌ Error 502 en `/api/dashboard/stats` → Verificar Railway
- ❌ Dashboard no carga → Verificar consola del navegador
- ❌ Estadísticas no se muestran → Verificar setup completo
- ❌ Popup "Backend no disponible" → Verificar Railway

**Si hay error:**
1. Verificar que setup está completo (`/api/setup-status`)
2. Verificar logs de Railway
3. Ejecutar `npm run smoke:prod`

---

### 6️⃣ CARGA DE PRODUCTOS

**Acción:**
- Ir a `/products`

**Qué ver:**
- Lista de productos (puede estar vacía si no hay productos)
- Filtros por estado y marketplace
- Botones de acción (aprobar, rechazar, publicar, etc.)
- Sin errores visibles

**Señales de Éxito:**
- ✅ Lista de productos carga correctamente
- ✅ Filtros funcionan
- ✅ Botones de acción funcionan
- ✅ No hay errores 502
- ✅ No hay popups de error

**Señales de Error:**
- ❌ Error 502 en `/api/products` → Verificar Railway
- ❌ Lista no carga → Verificar consola del navegador
- ❌ Botones no funcionan → Verificar setup completo

**Si hay error:**
1. Verificar que setup está completo
2. Verificar logs de Railway
3. Verificar consola del navegador para errores específicos

---

## 🎯 SEÑALES DE ÉXITO CLARAS

### Sistema Funcional
- ✅ Login exitoso sin errores
- ✅ Dashboard carga correctamente
- ✅ Productos se listan correctamente
- ✅ OAuth de AliExpress funciona
- ✅ Setup inicial se completa correctamente

### Sin Errores
- ✅ No hay popups de error 502
- ✅ No hay warnings en consola
- ✅ No hay errores de red
- ✅ No hay errores de CORS

---

## ⚠️ SEÑALES DE ERROR REALES vs ESPERADAS

### Errores Reales (Requieren Acción)
- ❌ **502 Bad Gateway:** Backend no disponible → Verificar Railway
- ❌ **404 Not Found:** Ruta no existe → Verificar `vercel.json` o rutas backend
- ❌ **401 Unauthorized:** Sesión expirada → Hacer login nuevamente
- ❌ **500 Internal Server Error:** Error del servidor → Verificar logs de Railway

### Errores Esperados (No Requieren Acción)
- ✅ **Setup Incompleto:** Redirige a `/setup-required` (comportamiento esperado)
- ✅ **Lista Vacía:** No hay productos/oportunidades (comportamiento esperado si no hay datos)
- ✅ **401 en endpoints protegidos:** Si no está autenticado (comportamiento esperado)

---

## 🔧 TROUBLESHOOTING RÁPIDO

### Error 502 en Múltiples Endpoints
1. Verificar que Railway backend está activo
2. Verificar logs de Railway
3. Ejecutar `npm run smoke:prod`
4. Verificar variables de entorno en Railway

### OAuth No Funciona
1. Verificar Redirect URI en AliExpress App Console
2. Verificar que serverless function existe en Vercel
3. Ejecutar smoke test del callback
4. Verificar logs de Vercel y Railway

### Setup No Se Completa
1. Verificar que tiene al menos un marketplace configurado
2. Verificar que tiene al menos una API de búsqueda configurada
3. Hacer clic en "Verificar de nuevo" en `/setup-required`
4. Verificar logs de backend para errores

---

## ✅ VALIDACIÓN FINAL

Una vez completado el checklist:

- [ ] Login funciona correctamente
- [ ] Setup inicial se completa (si aplica)
- [ ] Dashboard carga correctamente
- [ ] Productos se listan correctamente
- [ ] OAuth de AliExpress funciona
- [ ] No hay errores 502
- [ ] No hay warnings visibles
- [ ] Sistema está listo para uso

**Si todos los items están marcados:** ✅ **SISTEMA LISTO PARA PRODUCCIÓN**

---

## 📞 SOPORTE

Si encuentras problemas no cubiertos en este checklist:

1. Revisar `docs/PRODUCTION_RELEASE.md`
2. Revisar `docs/ENVIRONMENT_SNAPSHOT.md`
3. Ejecutar `npm run smoke:prod` para diagnóstico
4. Revisar logs de Vercel y Railway

---

**Fecha de creación:** 2025-01-26  
**Versión:** v1.0.0

