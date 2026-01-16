# 🔧 Configuración de ScraperAPI

**Última actualización:** 2025-01-11  
**Categoría:** Scraping (Búsqueda)  
**Requisito:** Opcional (alternativa a AliExpress Affiliate API)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con ScraperAPI permite:
- **Web scraping** de AliExpress y otros sitios sin bloqueos
- **Extraer datos de productos** cuando la API oficial no está disponible
- **Búsqueda de oportunidades** usando scraping como fallback

**Módulos que la usan:**
- `backend/src/services/advanced-scraper.service.ts` - Servicio de scraping
- `backend/src/services/scraper-bridge.service.ts` - Bridge de scraping
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Se usa como alternativa cuando AliExpress Affiliate API no está configurada o falla.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| API Key | `SCRAPERAPI_KEY` | Password | ✅ Sí | API Key de ScraperAPI |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Cuenta en ScraperAPI

1. Ir a [ScraperAPI](https://www.scraperapi.com/)
2. Hacer clic en **"Sign Up"** o **"Get Started"**
3. Completar registro con email y contraseña

### 2. Obtener API Key

1. Iniciar sesión en [ScraperAPI Dashboard](https://dashboard.scraperapi.com/)
2. Ir a **"API Keys"** o **"Account"**
3. Copiar tu **API Key** (formato: `abc123def456...`)

### 3. Verificar Plan

- **Free Plan:** 1,000 requests/mes
- **Paid Plans:** Más requests según el plan

**Documentación oficial:**
- [ScraperAPI Documentation](https://www.scraperapi.com/documentation/)
- [ScraperAPI Dashboard](https://dashboard.scraperapi.com/)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"ScraperAPI"**

### 2. Completar Campos

1. **API Key:** Pegar el API Key obtenido de ScraperAPI

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de ScraperAPI, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/scraperapi/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "scraperapi",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "API Key not found"

**Causa:** El API Key no está configurado o está vacío.

**Solución:**
- Verificar que el API Key esté completo (sin espacios)
- Verificar que se haya guardado correctamente

### Error 2: "Invalid API Key"

**Causa:** El API Key no es válido o ha expirado.

**Solución:**
- Verificar que el API Key sea correcto en ScraperAPI Dashboard
- Regenerar el API Key si es necesario

### Error 3: "Rate limit exceeded"

**Causa:** Se excedió el límite de requests del plan.

**Solución:**
- Verificar el uso en ScraperAPI Dashboard
- Esperar hasta el siguiente período de facturación
- Considerar actualizar el plan

---

## 📚 Referencias

- **Documentación oficial:** [ScraperAPI Documentation](https://www.scraperapi.com/documentation/)
- **Dashboard:** [ScraperAPI Dashboard](https://dashboard.scraperapi.com/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Uso:** Se usa como fallback cuando AliExpress Affiliate API no está disponible
- **Límites:** Respeta los límites del plan de ScraperAPI

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

