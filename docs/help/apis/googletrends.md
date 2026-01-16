# 🔧 Configuración de Google Trends API (SerpAPI)

**Última actualización:** 2025-01-11  
**Categoría:** Análisis (Validación de Productos)  
**Requisito:** Opcional (mejora validación de viabilidad)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con SerpAPI (Google Trends) permite:
- **Validar viabilidad de productos** usando datos de Google Trends
- **Analizar tendencias de búsqueda** para oportunidades
- **Mejorar precisión** en la detección de oportunidades rentables

**Módulos que la usan:**
- `backend/src/services/opportunity-finder.service.ts` - Búsqueda de oportunidades
- `backend/src/services/api-availability.service.ts` - Verificación de disponibilidad
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta API es opcional. Si no se configura, el sistema usa análisis de datos internos para validar viabilidad.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| SerpAPI Key | `SERP_API_KEY` | Password | ❌ No | API Key de SerpAPI (opcional) |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

**Nota:** Este campo es opcional. El sistema funcionará sin él usando análisis interno.

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Cuenta en SerpAPI

1. Ir a [SerpAPI](https://serpapi.com/)
2. Hacer clic en **"Sign Up"** o **"Get Started"**
3. Completar registro con email y contraseña

### 2. Obtener API Key

1. Iniciar sesión en [SerpAPI Dashboard](https://serpapi.com/dashboard)
2. Ir a **"API Key"** o **"Settings"** → **"API Key"**
3. Copiar tu **API Key**

### 3. Verificar Plan

- **Free Plan:** 100 searches/mes
- **Paid Plans:** Más searches según el plan

**Documentación oficial:**
- [SerpAPI Google Trends API](https://serpapi.com/google-trends-api)
- [SerpAPI Dashboard](https://serpapi.com/dashboard)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"Google Trends API (SerpAPI)"**

### 2. Completar Campos

1. **SerpAPI Key (Opcional):** Pegar el API Key obtenido de SerpAPI (opcional)

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba, opcional)

**Nota:** Si no configuras esta API, el sistema funcionará normalmente usando análisis interno.

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - Si está configurada, el estado debe mostrar **"Sesión activa"** (badge verde)
   - Si no está configurada, el estado mostrará **"Opcional"** o similar

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"** (si está disponible)
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/googletrends/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada y lista para usar",
  "data": {
    "apiName": "serpapi",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "API key vacía o inválida"

**Causa:** El API Key no está configurado o está vacío.

**Solución:**
- Esta API es opcional; el sistema funcionará sin ella
- Si quieres usarla, verificar que el API Key esté completo (sin espacios)

### Error 2: "API key con formato inválido"

**Causa:** El API Key no tiene el formato correcto.

**Solución:**
- Verificar que el API Key sea correcto en SerpAPI Dashboard
- Regenerar el API Key si es necesario

### Error 3: "Rate limit exceeded"

**Causa:** Se excedió el límite de searches del plan.

**Solución:**
- Verificar el uso en SerpAPI Dashboard
- Esperar hasta el siguiente período de facturación
- Considerar actualizar el plan

---

## 📚 Referencias

- **Documentación oficial:** [SerpAPI Google Trends API](https://serpapi.com/google-trends-api)
- **Dashboard:** [SerpAPI Dashboard](https://serpapi.com/dashboard)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Uso:** Se usa para validar viabilidad de productos usando Google Trends
- **Opcional:** Esta API es completamente opcional; el sistema usa análisis interno si no está configurada
- **Alias:** El sistema busca credenciales con nombre `serpapi` o `googletrends`

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

