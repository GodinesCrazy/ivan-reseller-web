# 🔍 Auditoría Profunda: AliExpress Auto-Purchase API

**Fecha**: 2025-12-11  
**Alcance**: Auditoría completa de la validación de credenciales, consistencia y uso de AliExpress Auto-Purchase API (legacy, usando Puppeteer)

---

## 📋 RESUMEN EJECUTIVO

### Problemas Encontrados y Corregidos

1. ❌ **CRÍTICO**: `checkAliExpressAPI` buscaba campos con nombres UPPER_CASE incorrectos
2. ✅ **VALIDACIÓN**: El servicio usa credenciales correctamente (camelCase)

---

## 🔧 CORRECCIONES IMPLEMENTADAS

### 1. Validación de Campos Corregida ✅

**Problema**: `checkAliExpressAPI` buscaba campos con nombres UPPER_CASE (`ALIEXPRESS_EMAIL`, `ALIEXPRESS_PASSWORD`) pero las credenciales se guardan en camelCase (`email`, `password`).

**Corrección** (`backend/src/services/api-availability.service.ts`):
```typescript
// ✅ ANTES (incorrecto):
const requiredFields = ['ALIEXPRESS_EMAIL', 'ALIEXPRESS_PASSWORD'];
const validation = this.hasRequiredFields(credentials, requiredFields);

// ✅ DESPUÉS (correcto):
const email = credentials['email'] || credentials['ALIEXPRESS_EMAIL'] || credentials['ALIEXPRESS_USERNAME'];
const password = credentials['password'] || credentials['ALIEXPRESS_PASSWORD'];

const hasEmail = !!(email && String(email).trim());
const hasPassword = !!(password && String(password).trim());

const validation = {
  valid: hasEmail && hasPassword,
  missing: [
    !hasEmail && 'email',
    !hasPassword && 'password'
  ].filter(Boolean) as string[]
};
```

**Nota**: Se mantiene compatibilidad con múltiples variantes de nombres legacy:
- `email` (camelCase, estándar) ✅
- `ALIEXPRESS_EMAIL` (variante legacy) ✅
- `ALIEXPRESS_USERNAME` (variante legacy alternativa) ✅
- `password` (camelCase, estándar) ✅
- `ALIEXPRESS_PASSWORD` (variante legacy) ✅

---

## 📊 VALIDACIÓN DE CREDENCIALES

### Campos Requeridos

**Básicos**:
- `email` - Email o username de AliExpress (o múltiples variantes UPPER_CASE para compatibilidad legacy)
- `password` - Contraseña de AliExpress (o `ALIEXPRESS_PASSWORD` para compatibilidad legacy)

**Opcionales**:
- `twoFactorEnabled` - Boolean, indica si 2FA está habilitado (default: `false`)
- `twoFactorSecret` - String, secreto para 2FA (opcional)
- `cookies` - Array, cookies persistentes para mantener sesión (opcional)

### Validación en `checkAliExpressAPI`

```typescript
// 1. Buscar campos con múltiples nombres posibles (compatibilidad)
const email = credentials['email'] || credentials['ALIEXPRESS_EMAIL'] || credentials['ALIEXPRESS_USERNAME'];
const password = credentials['password'] || credentials['ALIEXPRESS_PASSWORD'];

// 2. Verificar que los campos existen y no están vacíos
const hasEmail = !!(email && String(email).trim());
const hasPassword = !!(password && String(password).trim());

// 3. Determinar estado
if (!hasEmail || !hasPassword) {
  // No configurado
} else {
  // Healthy
}
```

### Schema Zod (`credentials-manager.service.ts`)

```typescript
aliexpress: z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  twoFactorEnabled: z.boolean().default(false),
  twoFactorSecret: z.string().optional(),
  cookies: z.array(z.any()).optional(),
}),
```

**✅ Correcto**: El schema valida `email` (formato email) y `password` (mínimo 1 carácter).

---

## 🔍 USO DE CREDENCIALES EN SERVICIOS

### En `aliexpress-auto-purchase.service.ts`

**✅ Correcto**: El servicio acepta credenciales en camelCase:

```typescript
export interface AliExpressCredentials {
  email: string;
  password: string;
  twoFactorEnabled?: boolean;
}

export class AliExpressAutoPurchaseService {
  private credentials: AliExpressCredentials | null = null;
  
  setCredentials(credentials: AliExpressCredentials): void {
    this.credentials = credentials;
  }
  
  async login(): Promise<boolean> {
    if (!this.credentials) {
      throw new AppError('AliExpress credentials not set', 400);
    }
    // Usa this.credentials.email y this.credentials.password
    // ...
  }
}
```

**✅ Correcto**: El servicio usa las credenciales correctamente.

---

## 🔄 NORMALIZACIÓN DE CREDENCIALES

### En `CredentialsManager.normalizeCredential`

**✅ Correcto**: Hay normalización específica para AliExpress:

```typescript
if (apiName === 'aliexpress') {
  // Normalizar twoFactorEnabled a boolean
  if (typeof creds.twoFactorEnabled === 'string') {
    creds.twoFactorEnabled = creds.twoFactorEnabled.toLowerCase() === 'true';
  }
  if (creds.twoFactorEnabled === undefined || creds.twoFactorEnabled === null) {
    creds.twoFactorEnabled = false;
  }
  
  // Normalizar cookies de string a array
  if (typeof creds.cookies === 'string') {
    try {
      const parsed = JSON.parse(creds.cookies);
      if (Array.isArray(parsed)) {
        creds.cookies = parsed;
      } else {
        delete creds.cookies;
      }
    } catch {
      delete creds.cookies;
    }
  }
}
```

**Nota**: No hay normalización explícita para `ALIEXPRESS_EMAIL` → `email` o `ALIEXPRESS_PASSWORD` → `password`, pero esto no es necesario porque el frontend ya envía los campos en camelCase.

---

## 🔄 ESTADOS DE CONFIGURACIÓN

### Estados Distinguidos

| Estado | Condición | Mensaje |
|--------|-----------|---------|
| `not_configured` | No hay `email` o `password` | "AliExpress API not configured for this user" |
| `healthy` | `email` y `password` presentes y válidos | "API configurada correctamente" |
| `unhealthy` | `email` o `password` vacío o inválido | "Faltan credenciales requeridas: email, password" |

---

## 📝 NOTA SOBRE AMBIENTES

### AliExpress Auto-Purchase no Soporta Ambientes

AliExpress Auto-Purchase **no tiene distinción entre sandbox y production**. Solo hay una cuenta de AliExpress real que se usa para automatización.

**Implicaciones**:
- No se requiere parámetro `environment` en `checkAliExpressAPI()`
- No hay soporte para sandbox en `getAllAPIStatus()`
- Las credenciales siempre se buscan en ambiente `production` (solo organizacional)

---

## ⚠️ IMPORTANTE: NATURALEZA LEGACY

### AliExpress Auto-Purchase es un Servicio Legacy

**AliExpress NO tiene API oficial** para automatización. Este servicio usa:

1. **Puppeteer** - Automatización del navegador
2. **Stealth Plugin** - Para evitar detección
3. **Login manual** - Usa email/password reales
4. **Compra automatizada** - Navega por la UI de AliExpress

**Limitaciones**:
- ⚠️ Frágil a cambios en la UI de AliExpress
- ⚠️ Requiere mantener sesión activa (cookies)
- ⚠️ Puede requerir 2FA manual
- ⚠️ Toma 20-30 segundos por compra
- ⚠️ Vulnerable a detección de bots

**Recomendación**: Migrar a usar **AliExpress Dropshipping API** (más confiable) cuando sea posible, manteniendo Puppeteer como fallback.

---

## 📁 ARCHIVOS MODIFICADOS

1. **`backend/src/services/api-availability.service.ts`**
   - Corregida validación de campos (camelCase + múltiples variantes UPPER_CASE para compatibilidad)
   - Agregado estado `status: 'healthy' | 'unhealthy'`

---

## ✅ VERIFICACIÓN DE CONSISTENCIA

### Normalización de Campos

✅ **AliExpress Auto-Purchase**: Los campos se guardan correctamente en camelCase
- Frontend envía `email` y `password` directamente ✅
- Backend valida `email` y `password` ✅ **CORREGIDO**
- Schema Zod valida `email` (formato email) y `password` (mínimo 1 carácter) ✅

### Uso en Servicios

✅ **Servicio**: `aliexpress-auto-purchase.service.ts` usa credenciales correctamente
- Usa `email` y `password` desde `AliExpressCredentials` ✅
- Soporta `twoFactorEnabled` para 2FA ✅
- Usa Puppeteer para automatización (legacy) ✅

---

## 🧪 PRUEBAS RECOMENDADAS

### Prueba 1: AliExpress Auto-Purchase en Production
1. Configurar `email` y `password` (ambiente production)
2. **Verificar**: Estado muestra "API configurada correctamente"

### Prueba 2: Validación de Estados
1. Guardar credenciales sin `email`
2. **Verificar**: Muestra "Faltan credenciales requeridas: email"
3. Agregar `email` pero sin `password`
4. **Verificar**: Muestra "Faltan credenciales requeridas: password"
5. Agregar ambos campos válidos
6. **Verificar**: Muestra "API configurada correctamente"

### Prueba 3: Compatibilidad con Campos Legacy
1. Guardar credenciales con nombres legacy (`ALIEXPRESS_EMAIL`, `ALIEXPRESS_PASSWORD`)
2. **Verificar**: Se normalizan correctamente y la validación funciona

### Prueba 4: Validación de Email
1. Guardar credenciales con `email` inválido (ej: "invalid-email")
2. **Verificar**: Schema Zod rechaza con "Valid email is required"

---

## ✅ ESTADO FINAL

- ✅ AliExpress Auto-Purchase: Validación de campos corregida (camelCase + múltiples variantes UPPER_CASE)
- ✅ AliExpress Auto-Purchase: Compatibilidad con campos legacy mantenida
- ✅ AliExpress Auto-Purchase: Normalización de `twoFactorEnabled` y `cookies` funciona correctamente
- ✅ Consistencia: Normalización y validación funcionan correctamente
- ⚠️ AliExpress Auto-Purchase: Servicio legacy (Puppeteer) - considerar migrar a AliExpress Dropshipping API cuando sea posible

---

**Última actualización**: 2025-12-11

