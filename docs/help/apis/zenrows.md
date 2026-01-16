# 🔧 Configuración de ZenRows API

**Última actualización:** 2025-01-11  
**Categoría:** Scraping (Búsqueda)  
**Requisito:** Opcional (alternativa a ScraperAPI)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con ZenRows API permite:
- **Web scraping** de AliExpress y otros sitios sin bloqueos
- **Extraer datos de productos** cuando la API oficial no está disponible
- **Búsqueda de oportunidades** usando scraping como fallback

**Módulos que la usan:**
- `backend/src/services/advanced-scraper.service.ts` - Servicio de scraping
- `backend/src/services/scraper-bridge.service.ts` - Bridge de scraping
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Se usa como alternativa cuando ScraperAPI no está configurada o falla. Es opcional.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| API Key | `ZENROWS_API_KEY` | Password | ✅ Sí | API Key de ZenRows |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Cuenta en ZenRows

1. Ir a [ZenRows](https://www.zenrows.com/)
2. Hacer clic en **"Sign Up"** o **"Get Started"**
3. Completar registro con email y contraseña

### 2. Obtener API Key

1. Iniciar sesión en [ZenRows Dashboard](https://app.zenrows.com/)
2. Ir a **"API Keys"** o **"Settings"**
3. Copiar tu **API Key**

### 3. Verificar Plan

- **Free Plan:** Límites según el plan
- **Paid Plans:** Más requests según el plan

**Documentación oficial:**
- [ZenRows Documentation](https://www.zenrows.com/documentation)
- [ZenRows Dashboard](https://app.zenrows.com/)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"ZenRows API"**

### 2. Completar Campos

1. **API Key:** Pegar el API Key obtenido de ZenRows

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de ZenRows, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/zenrows/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "zenrows",
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
- Verificar que el API Key sea correcto en ZenRows Dashboard
- Regenerar el API Key si es necesario

### Error 3: "Rate limit exceeded"

**Causa:** Se excedió el límite de requests del plan.

**Solución:**
- Verificar el uso en ZenRows Dashboard
- Esperar hasta el siguiente período de facturación
- Considerar actualizar el plan

---

## 📚 Referencias

- **Documentación oficial:** [ZenRows Documentation](https://www.zenrows.com/documentation)
- **Dashboard:** [ZenRows Dashboard](https://app.zenrows.com/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Uso:** Se usa como fallback cuando ScraperAPI no está disponible
- **Límites:** Respeta los límites del plan de ZenRows
- **Opcional:** Esta API es opcional; el sistema funciona sin ella

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

