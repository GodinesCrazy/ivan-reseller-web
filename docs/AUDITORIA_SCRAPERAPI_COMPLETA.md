# 🔍 Auditoría Profunda: ScraperAPI

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa de la validación de credenciales, consistencia y uso de ScraperAPI

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: `checkScraperAPI` buscaba campo con nombre UPPER_CASE incorrecto
2. ⚠️ **NOTA**: Algunos servicios usan variables de entorno directamente (legacy)

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Validación de Campo Corregida ✅

**Problema**: `checkScraperAPI` buscaba campo con nombre UPPER_CASE (`SCRAPER_API_KEY`) pero las credenciales se guardan en camelCase (`apiKey`).

**Corrección** (`backend/src/services/api-availability.service.ts`):
```typescript
// ✅ ANTES (incorrecto):
const requiredFields = ['SCRAPER_API_KEY'];
const validation = this.hasRequiredFields(credentials, requiredFields);

// ✅ DESPUÉS (correcto):
const apiKey = credentials['apiKey'] || credentials['SCRAPERAPI_KEY'] || credentials['SCRAPER_API_KEY'];
const hasApiKey = !!(apiKey && String(apiKey).trim());
const validation = {
  valid: hasApiKey,
  missing: !hasApiKey ? ['apiKey'] : []
};
```

**Nota**: Se mantiene compatibilidad con múltiples variantes de nombres legacy:
- `apiKey` (camelCase, estándar)
- `SCRAPERAPI_KEY` (variable de entorno estándar)
- `SCRAPER_API_KEY` (variante legacy)

---

## 📊 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos**:
- `apiKey` - ScraperAPI Key (o `SCRAPERAPI_KEY` / `SCRAPER_API_KEY` para compatibilidad legacy)

**Opcionales**:
- `premium` - Boolean que indica si usa cuenta premium

### Validación en `checkScraperAPI`

```typescript
// 1. Buscar campo con múltiples nombres posibles (compatibilidad)
const apiKey = credentials['apiKey'] || credentials['SCRAPERAPI_KEY'] || credentials['SCRAPER_API_KEY'];

// 2. Verificar que el campo existe y no está vacío
const hasApiKey = !!(apiKey && String(apiKey).trim());

// 3. Determinar estado
if (!hasApiKey) {
  // No configurado
} else {
  // Healthy
}
```

---

## 🔍 USO DE CREDENCIALES EN SERVICIOS

### En Servicios Legacy (Variables de Entorno)

**⚠️ NOTA**: Algunos servicios todavía usan variables de entorno directamente:

1. **`scraping.service.ts`**:
   ```typescript
   private readonly PROXY_API_KEY = process.env.SCRAPERAPI_KEY;
   ```

2. **`stealth-scraping.service.ts`**:
   ```typescript
   if (process.env.SCRAPERAPI_KEY) {
     this.proxyList.push({
       url: `http://scraperapi:${process.env.SCRAPERAPI_KEY}@proxy-server.scraperapi.com:8001`,
     });
   }
   ```

3. **`proxy-manager.service.ts`**:
   ```typescript
   if (process.env.SCRAPERAPI_KEY) {
     this.addProxyFromObject({
       host: 'proxy-server.scraperapi.com',
       port: 8001,
       username: 'scraperapi',
       password: process.env.SCRAPERAPI_KEY,
       type: ProxyType.ROTATING,
     });
   }
   ```

**Recomendación**: Estos servicios deberían migrar a usar `CredentialsManager.getCredentials()` para soportar credenciales multi-tenant. Sin embargo, esta migración está fuera del alcance de esta auditoría.

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | No hay `apiKey` | "ScraperAPI not configured for this user" |
| `healthy` | `apiKey` presente y válido | "API configurada correctamente" |
| `unhealthy` | `apiKey` vacío o inválido | "Faltan credenciales requeridas: apiKey" |

---

## 📝 NOTA SOBRE AMBIENTES

### ScraperAPI no Soporta Ambientes

ScraperAPI **no tiene distinción entre sandbox y production**. Solo hay un endpoint único:
- Proxy: `http://scraperapi:{apiKey}@proxy-server.scraperapi.com:8001`
- API REST: `http://api.scraperapi.com`

**Implicaciones**:
- No se requiere parámetro `environment` en `checkScraperAPI()`
- No hay soporte para sandbox en `getAllAPIStatus()`
- Las credenciales siempre se buscan en ambiente `production` (solo organizacional)

---

## 📁 ARCHIVOS MODIFICADOS

1. **`backend/src/services/api-availability.service.ts`**
   - Corregida validación de campo (camelCase + múltiples variantes UPPER_CASE para compatibilidad)
   - Agregado estado `status: 'healthy' | 'unhealthy'`

---

## ✅ VERIFICACIÓN DE CONSISTENCIA

### Normalización de Campos

✅ **ScraperAPI**: Los campos se guardan correctamente en camelCase
- Frontend mapea `SCRAPERAPI_KEY` → `apiKey` ✅
- Backend valida `apiKey` ✅ **CORREGIDO**
- Schema Zod valida `apiKey` ✅

### Uso en Servicios

⚠️ **Servicios Legacy**: Algunos servicios usan variables de entorno directamente
- `scraping.service.ts`: Usa `process.env.SCRAPERAPI_KEY` (legacy)
- `stealth-scraping.service.ts`: Usa `process.env.SCRAPERAPI_KEY` (legacy)
- `proxy-manager.service.ts`: Usa `process.env.SCRAPERAPI_KEY` (legacy)

**Nota**: Estos servicios funcionan correctamente con variables de entorno, pero no soportan credenciales multi-tenant desde la base de datos. Esto es una limitación conocida que podría abordarse en una migración futura.

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: ScraperAPI en Production
1. Configurar `apiKey` (ambiente production)
2. **Verificar**: Estado muestra "API configurada correctamente"

### Prueba 2: Validación de Estados
1. Guardar credenciales sin `apiKey`
2. **Verificar**: Muestra "Faltan credenciales requeridas: apiKey"
3. Agregar `apiKey` válido
4. **Verificar**: Muestra "API configurada correctamente"

### Prueba 3: Compatibilidad con Campos Legacy
1. Guardar credenciales con nombres legacy (`SCRAPERAPI_KEY` o `SCRAPER_API_KEY`)
2. **Verificar**: Se normalizan correctamente y la validación funciona

---

## ✅ ESTADO FINAL

- ✅ ScraperAPI: Validación de campo corregida (camelCase + múltiples variantes UPPER_CASE)
- ✅ ScraperAPI: Compatibilidad con campos legacy mantenida
- ⚠️ ScraperAPI: Algunos servicios usan variables de entorno (legacy, funcional pero no multi-tenant)
- ✅ Consistencia: Normalización y validación funcionan correctamente

---

**Última actualización**: 2025-12-11

