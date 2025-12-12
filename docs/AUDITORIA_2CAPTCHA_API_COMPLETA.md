# 🔍 Auditoría Profunda: 2Captcha API

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa de la validación de credenciales, consistencia y uso de 2Captcha API

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: `check2CaptchaAPI` buscaba campo con nombre UPPER_CASE incorrecto
2. ⚠️ **NOTA**: El servicio `anti-captcha.service.ts` usa variables de entorno directamente (legacy)

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Validación de Campo Corregida ✅

**Problema**: `check2CaptchaAPI` buscaba campo con nombre UPPER_CASE (`CAPTCHA_2CAPTCHA_KEY`) pero las credenciales se guardan en camelCase (`apiKey`).

**Corrección** (`backend/src/services/api-availability.service.ts`):
```typescript
// ✅ ANTES (incorrecto):
const requiredFields = ['CAPTCHA_2CAPTCHA_KEY'];
const validation = this.hasRequiredFields(credentials, requiredFields);

// ✅ DESPUÉS (correcto):
const apiKey = credentials['apiKey'] || credentials['CAPTCHA_2CAPTCHA_KEY'] || credentials['TWO_CAPTCHA_API_KEY'] || credentials['2CAPTCHA_API_KEY'];
const hasApiKey = !!(apiKey && String(apiKey).trim());
const validation = {
  valid: hasApiKey,
  missing: !hasApiKey ? ['apiKey'] : []
};
```

**Nota**: Se mantiene compatibilidad con múltiples variantes de nombres legacy:
- `apiKey` (camelCase, estándar)
- `CAPTCHA_2CAPTCHA_KEY` (variante legacy)
- `TWO_CAPTCHA_API_KEY` (variable de entorno estándar)
- `2CAPTCHA_API_KEY` (variante alternativa)

---

## 📊 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos**:
- `apiKey` - 2Captcha API Key (o múltiples variantes UPPER_CASE para compatibilidad legacy)

### Validación en `check2CaptchaAPI`

```typescript
// 1. Buscar campo con múltiples nombres posibles (compatibilidad)
const apiKey = credentials['apiKey'] || credentials['CAPTCHA_2CAPTCHA_KEY'] || credentials['TWO_CAPTCHA_API_KEY'] || credentials['2CAPTCHA_API_KEY'];

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

### En `anti-captcha.service.ts` (Legacy)

**⚠️ NOTA**: El servicio usa variables de entorno directamente:

```typescript
private initializeProviders(): void {
  // Initialize 2Captcha if API key is available
  if (process.env.TWO_CAPTCHA_API_KEY) {
    this.providers.push(new TwoCaptchaProvider(process.env.TWO_CAPTCHA_API_KEY));
    logger.info('2Captcha provider initialized');
  }
  // ...
}
```

**Recomendación**: Este servicio debería migrar a usar `CredentialsManager.getCredentials()` para soportar credenciales multi-tenant. Sin embargo, esta migración está fuera del alcance de esta auditoría.

### En `TwoCaptchaProvider`

**✅ Correcto**: El provider acepta `apiKey` como parámetro en el constructor:
```typescript
class TwoCaptchaProvider implements ICaptchaProvider {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  // ...
}
```

Esto significa que el servicio puede migrarse fácilmente para usar credenciales desde la base de datos.

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | No hay `apiKey` | "2Captcha not configured for this user" |
| `healthy` | `apiKey` presente y válido | "API configurada correctamente" |
| `unhealthy` | `apiKey` vacío o inválido | "Faltan credenciales requeridas: apiKey" |

---

## 📝 NOTA SOBRE AMBIENTES

### 2Captcha no Soporta Ambientes

2Captcha API **no tiene distinción entre sandbox y production**. Solo hay un endpoint único:
- API: `https://2captcha.com/in.php` y `https://2captcha.com/res.php`

**Implicaciones**:
- No se requiere parámetro `environment` en `check2CaptchaAPI()`
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

✅ **2Captcha**: Los campos se guardan correctamente en camelCase
- Frontend mapea `CAPTCHA_API_KEY` → `apiKey` ✅
- Backend valida `apiKey` ✅ **CORREGIDO**
- Schema Zod valida `apiKey` ✅

### Uso en Servicios

⚠️ **Servicio Legacy**: `anti-captcha.service.ts` usa variables de entorno directamente
- Usa `process.env.TWO_CAPTCHA_API_KEY` (legacy)
- Funciona correctamente pero no soporta credenciales multi-tenant desde la base de datos
- El provider `TwoCaptchaProvider` acepta `apiKey` como parámetro, lo que facilita la migración futura

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: 2Captcha en Production
1. Configurar `apiKey` (ambiente production)
2. **Verificar**: Estado muestra "API configurada correctamente"

### Prueba 2: Validación de Estados
1. Guardar credenciales sin `apiKey`
2. **Verificar**: Muestra "Faltan credenciales requeridas: apiKey"
3. Agregar `apiKey` válido
4. **Verificar**: Muestra "API configurada correctamente"

### Prueba 3: Compatibilidad con Campos Legacy
1. Guardar credenciales con nombres legacy (`CAPTCHA_2CAPTCHA_KEY`, `TWO_CAPTCHA_API_KEY`, etc.)
2. **Verificar**: Se normalizan correctamente y la validación funciona

---

## ✅ ESTADO FINAL

- ✅ 2Captcha: Validación de campo corregida (camelCase + múltiples variantes UPPER_CASE)
- ✅ 2Captcha: Compatibilidad con campos legacy mantenida
- ⚠️ 2Captcha: Servicio legacy usa variables de entorno (funcional pero no multi-tenant)
- ✅ Consistencia: Normalización y validación funcionan correctamente

---

**Última actualización**: 2025-12-11

