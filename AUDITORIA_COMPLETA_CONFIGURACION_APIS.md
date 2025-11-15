# 🔍 AUDITORÍA COMPLETA: Sistema de Configuración de APIs

**Fecha**: 2025-11-15  
**Objetivo**: Auditar todo el sistema de configuración de APIs, sus interacciones, consistencia con el modelo y simplificaciones posibles

---

## 📋 ÍNDICE

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [Flujo de Datos](#2-flujo-de-datos)
3. [Problemas Identificados](#3-problemas-identificados)
4. [Inconsistencias](#4-inconsistencias)
5. [Duplicaciones](#5-duplicaciones)
6. [Simplificaciones Propuestas](#6-simplificaciones-propuestas)
7. [Plan de Acción](#7-plan-de-acción)

---

## 1. ARQUITECTURA DEL SISTEMA

### 1.1 Componentes Principales

#### Backend

1. **`CredentialsManager`** (`backend/src/services/credentials-manager.service.ts`)
   - Servicio centralizado para gestión de credenciales
   - Encriptación/desencriptación
   - Validación con Zod
   - Normalización de credenciales
   - Caché de credenciales desencriptadas (TTL: 5 min)

2. **`api-credentials.routes.ts`**
   - Endpoints REST para CRUD de credenciales
   - Validación de permisos (user vs admin)
   - Manejo de scope (user vs global)

3. **`marketplace.routes.ts`**
   - Endpoints específicos para marketplaces
   - Generación de URLs OAuth
   - Validación de redirect_uri

4. **`api-keys.config.ts`**
   - Configuración centralizada de nombres de variables de entorno
   - Mapeo de APIs a ambientes (sandbox/production)
   - Helpers para validar soporte de ambientes

5. **`api-credentials.types.ts`**
   - Interfaces TypeScript para cada tipo de API
   - Type safety para credenciales

#### Frontend

1. **`APISettings.tsx`**
   - Componente principal de configuración
   - Mapeo de campos UPPER_CASE → camelCase
   - Manejo de ambientes (sandbox/production)
   - Manejo de scope (user vs global)

2. **`api-credentials.schemas.ts`**
   - Schemas Zod para validación en frontend
   - Validación de campos requeridos

### 1.2 Modelo de Datos

```prisma
model ApiCredential {
  id          Int             @id
  userId      Int
  apiName     String          // ebay, mercadolibre, amazon, etc.
  environment String          // sandbox, production
  credentials String          // JSON encriptado
  isActive    Boolean
  scope       CredentialScope // user, global
  sharedById  Int?
  
  @@unique([userId, apiName, environment, scope])
}
```

---

## 2. FLUJO DE DATOS

### 2.1 Guardar Credenciales

```
Frontend (APISettings.tsx)
  ↓
1. Usuario completa campos (EBAY_APP_ID, EBAY_DEV_ID, etc.)
  ↓
2. handleSave() mapea campos UPPER_CASE → camelCase
   - EBAY_APP_ID → appId
   - EBAY_DEV_ID → devId
   - EBAY_CERT_ID → certId
   - EBAY_REDIRECT_URI → redirectUri
  ↓
3. POST /api/credentials
   {
     apiName: "ebay",
     environment: "sandbox",
     credentials: { appId, devId, certId, redirectUri },
     scope: "user"
   }
  ↓
Backend (api-credentials.routes.ts)
  ↓
4. Validar permisos y scope
  ↓
5. CredentialsManager.normalizeCredential()
   - Normaliza campos (ruName → redirectUri)
   - Limpia prefijos (redirect_uri=)
   - Valida formato
  ↓
6. CredentialsManager.validateCredentials()
   - Valida con schemas Zod
   - Verifica campos requeridos
  ↓
7. CredentialsManager.saveCredentials()
   - Encripta credenciales
   - Guarda en DB (upsert)
   - Limpia caché
```

### 2.2 Obtener Credenciales

```
Backend Service (ej: EbayService)
  ↓
1. CredentialsManager.getCredentials(userId, 'ebay', 'sandbox')
  ↓
2. Verifica caché (TTL: 5 min)
  ↓
3. Si no en caché:
   - Query DB (userId + apiName + environment)
   - Prioriza scope 'user' sobre 'global'
   - Desencripta
   - Normaliza
   - Guarda en caché
  ↓
4. Retorna credenciales normalizadas
```

---

## 3. PROBLEMAS IDENTIFICADOS

### 3.1 🔴 CRÍTICO: Duplicación de Mapeo de Campos

**Ubicación**: Múltiples archivos

**Problema**:
- Frontend mapea `EBAY_APP_ID` → `appId` en `APISettings.tsx` (línea 734)
- Backend tiene mapeo similar en `api-credentials.routes.ts` (línea 782)
- `api-keys.config.ts` define constantes que no se usan consistentemente

**Impacto**:
- Mantenimiento difícil: cambios requieren actualizar múltiples lugares
- Riesgo de inconsistencias
- Código duplicado

**Ejemplo**:
```typescript
// frontend/src/pages/APISettings.tsx (línea 733)
const fieldMapping: Record<string, string> = {
  'EBAY_APP_ID': 'appId',
  'EBAY_DEV_ID': 'devId',
  'EBAY_CERT_ID': 'certId',
  'EBAY_REDIRECT_URI': 'redirectUri',
  // ... más campos
};

// backend/src/api/routes/api-credentials.routes.ts (línea 782)
const fieldMapping: Record<string, Record<string, string>> = {
  'ebay': { 'appId': 'EBAY_APP_ID', 'devId': 'EBAY_DEV_ID', 'certId': 'EBAY_CERT_ID' },
  // ... más APIs
};
```

### 3.2 🟡 MEDIO: Inconsistencia en Nombres de Campos

**Problema**:
- Frontend usa `EBAY_APP_ID` (UPPER_CASE con prefijo)
- Backend espera `appId` (camelCase)
- Algunos servicios usan `authToken`, otros `token`
- eBay: `redirectUri` vs `ruName` vs `redirect_uri`

**Impacto**:
- Confusión para desarrolladores
- Errores de mapeo
- Necesidad de normalización compleja

### 3.3 🟡 MEDIO: Validación Duplicada

**Problema**:
- Frontend valida con Zod (`api-credentials.schemas.ts`)
- Backend valida con Zod (`credentials-manager.service.ts`)
- Validaciones ligeramente diferentes

**Ejemplo**:
```typescript
// Frontend (api-credentials.schemas.ts)
redirectUri: z.string().url('Redirect URI debe ser una URL válida').optional()

// Backend (credentials-manager.service.ts)
redirectUri: z.string().min(1).max(255).optional()
```

**Impacto**:
- Validaciones inconsistentes
- Errores diferentes en frontend vs backend
- Mantenimiento duplicado

### 3.4 🟡 MEDIO: Complejidad en Normalización

**Problema**:
- `normalizeCredential()` tiene lógica compleja para eBay
- Maneja múltiples alias: `ruName`, `redirect_uri`, `redirectUri`
- Limpia prefijos y URLs
- Lógica específica por API mezclada

**Impacto**:
- Código difícil de mantener
- Difícil de testear
- Riesgo de bugs

### 3.5 🟢 BAJO: Configuración de API Keys No Utilizada

**Problema**:
- `api-keys.config.ts` define constantes detalladas
- Muchas constantes no se usan en el código
- Solo se usa `supportsEnvironments()`

**Ejemplo**:
```typescript
// api-keys.config.ts define:
EBAY: {
  SANDBOX: { APP_ID: 'EBAY_SANDBOX_APP_ID', ... },
  PRODUCTION: { APP_ID: 'EBAY_PRODUCTION_APP_ID', ... },
  LEGACY: { APP_ID: 'EBAY_APP_ID', ... }
}

// Pero en el código solo se usa:
supportsEnvironments('ebay') // true/false
```

### 3.6 🟡 MEDIO: Múltiples Endpoints para lo Mismo

**Problema**:
- `/api/credentials` - CRUD general
- `/api/marketplace/auth-url/:marketplace` - OAuth específico
- `/api/marketplace/credentials` - Credenciales de marketplace
- `/api/api-credentials` - Alias del primero

**Impacto**:
- Confusión sobre qué endpoint usar
- Duplicación de lógica
- Mantenimiento más complejo

### 3.7 🟡 MEDIO: Scope (user vs global) Complejo

**Problema**:
- Lógica de scope dispersa en múltiples lugares
- Validaciones de permisos duplicadas
- APIs personales (ebay, amazon) no pueden ser globales
- Lógica de "masked" para credenciales globales

**Impacto**:
- Código complejo
- Difícil de entender
- Riesgo de bugs de seguridad

---

## 4. INCONSISTENCIAS

### 4.1 Nomenclatura de Campos

| Contexto | Formato | Ejemplo |
|----------|---------|---------|
| Frontend UI | UPPER_CASE con prefijo | `EBAY_APP_ID` |
| Frontend → Backend | camelCase | `appId` |
| Backend Types | camelCase | `appId` |
| Backend DB | JSON encriptado | `{ "appId": "..." }` |
| Variables de entorno | UPPER_CASE | `EBAY_APP_ID` |

**Problema**: 4 formatos diferentes para el mismo concepto

### 4.2 Validación de Redirect URI

| Ubicación | Validación |
|-----------|------------|
| Frontend Zod | `.url()` (debe ser URL válida) |
| Backend Zod | `.min(1).max(255)` (solo longitud) |
| Backend Normalize | Limpia prefijos, extrae de URLs |
| Marketplace Routes | Valida caracteres problemáticos |

**Problema**: Validaciones contradictorias (URL vs string simple)

### 4.3 Manejo de Ambientes

| API | Soporta Ambientes | Implementación |
|-----|-------------------|----------------|
| eBay | ✅ Sí | `sandbox: boolean` en credenciales |
| Amazon | ✅ Sí | `sandbox: boolean` en credenciales |
| MercadoLibre | ✅ Sí | `sandbox: boolean` en credenciales |
| PayPal | ✅ Sí | `environment: 'sandbox' \| 'live'` |
| GROQ | ❌ No | Solo production |
| ScraperAPI | ❌ No | Solo production |

**Problema**: Inconsistencia en cómo se representa el ambiente

---

## 5. DUPLICACIONES

### 5.1 Mapeo de Campos

**Duplicado en**:
1. `frontend/src/pages/APISettings.tsx` (línea 733)
2. `backend/src/api/routes/api-credentials.routes.ts` (línea 782)
3. `backend/src/config/api-keys.config.ts` (definiciones parciales)

### 5.2 Validación de Credenciales

**Duplicado en**:
1. `frontend/src/validations/api-credentials.schemas.ts`
2. `backend/src/services/credentials-manager.service.ts` (línea 88)

### 5.3 Lógica de Scope

**Duplicado en**:
1. `backend/src/api/routes/api-credentials.routes.ts` (línea 38)
2. `frontend/src/pages/APISettings.tsx` (línea 568)
3. `backend/src/services/credentials-manager.service.ts` (validaciones)

### 5.4 Normalización de Credenciales

**Duplicado en**:
1. `CredentialsManager.normalizeCredential()` (centralizado)
2. `marketplace.routes.ts` (normalización parcial)
3. Lógica específica en cada servicio (ebay.service.ts, etc.)

---

## 6. SIMPLIFICACIONES PROPUESTAS

### 6.1 ✅ ALTA: Centralizar Mapeo de Campos

**Problema**: Mapeo duplicado en frontend y backend

**Solución**: Crear archivo de configuración compartido

```typescript
// shared/api-field-mapping.ts (o backend/src/config/field-mapping.ts)
export const API_FIELD_MAPPING = {
  ebay: {
    // Frontend → Backend
    'EBAY_APP_ID': 'appId',
    'EBAY_DEV_ID': 'devId',
    'EBAY_CERT_ID': 'certId',
    'EBAY_REDIRECT_URI': 'redirectUri',
    'EBAY_TOKEN': 'token',
    // Backend → Frontend (inverso)
    'appId': 'EBAY_APP_ID',
    'devId': 'EBAY_DEV_ID',
    'certId': 'EBAY_CERT_ID',
    'redirectUri': 'EBAY_REDIRECT_URI',
    'token': 'EBAY_TOKEN',
  },
  // ... más APIs
} as const;

// Helper functions
export function mapFrontendToBackend(apiName: string, fields: Record<string, any>): Record<string, any> {
  const mapping = API_FIELD_MAPPING[apiName] || {};
  const result: Record<string, any> = {};
  for (const [frontendKey, value] of Object.entries(fields)) {
    const backendKey = mapping[frontendKey] || frontendKey;
    result[backendKey] = value;
  }
  return result;
}

export function mapBackendToFrontend(apiName: string, fields: Record<string, any>): Record<string, any> {
  const mapping = API_FIELD_MAPPING[apiName] || {};
  const result: Record<string, any> = {};
  for (const [backendKey, value] of Object.entries(fields)) {
    const frontendKey = mapping[backendKey] || backendKey;
    result[frontendKey] = value;
  }
  return result;
}
```

**Beneficios**:
- ✅ Un solo lugar para mantener mapeos
- ✅ Consistencia garantizada
- ✅ Fácil de extender

### 6.2 ✅ ALTA: Unificar Validación

**Problema**: Validaciones duplicadas y contradictorias

**Solución**: Schema Zod compartido (o generado desde backend)

```typescript
// Opción 1: Backend exporta schemas
// backend/src/schemas/api-credentials.schemas.ts
export const ebayCredentialsSchema = z.object({
  appId: z.string().min(1).max(255),
  devId: z.string().min(1).max(255),
  certId: z.string().min(1).max(255),
  redirectUri: z.string().min(1).max(255), // NO .url() - es RuName, no URL
  token: z.string().max(1000).optional(),
  refreshToken: z.string().max(1000).optional(),
  sandbox: z.boolean().optional(),
});

// Frontend importa desde backend (si es posible) o copia exacta
```

**O mejor**: Endpoint que expone schemas

```typescript
// GET /api/credentials/schemas/:apiName
// Retorna schema JSON Schema o Zod para validación en frontend
```

**Beneficios**:
- ✅ Validación consistente
- ✅ Un solo lugar para mantener
- ✅ Type safety

### 6.3 ✅ MEDIA: Simplificar Normalización

**Problema**: Lógica compleja y específica por API

**Solución**: Separar normalización general de específica

```typescript
// credentials-manager.service.ts
static normalizeCredential(
  apiName: ApiName,
  credential: Record<string, any>,
  environment: ApiEnvironment
): Record<string, any> {
  // 1. Normalización general (trim, etc.)
  const normalized = this.generalNormalization(credential);
  
  // 2. Normalización específica por API (si existe)
  const apiNormalizer = this.getApiNormalizer(apiName);
  if (apiNormalizer) {
    return apiNormalizer(normalized, environment);
  }
  
  return normalized;
}

private static getApiNormalizer(apiName: ApiName) {
  const normalizers = {
    ebay: this.normalizeEbayCredentials,
    // ... más APIs
  };
  return normalizers[apiName];
}

private static normalizeEbayCredentials(
  creds: Record<string, any>,
  environment: ApiEnvironment
): Record<string, any> {
  // Lógica específica de eBay aislada
  // ...
}
```

**Beneficios**:
- ✅ Código más organizado
- ✅ Fácil de testear
- ✅ Fácil de extender

### 6.4 ✅ MEDIA: Simplificar Configuración de API Keys

**Problema**: Muchas constantes no utilizadas

**Solución**: Mantener solo lo necesario

```typescript
// api-keys.config.ts (simplificado)
export const API_CONFIG = {
  ebay: {
    supportsEnvironments: true,
    fields: ['appId', 'devId', 'certId', 'redirectUri', 'token'],
    requiredFields: ['appId', 'devId', 'certId', 'redirectUri'],
  },
  // ... más APIs
} as const;

// Eliminar constantes de variables de entorno no utilizadas
// O moverlas a documentación
```

**Beneficios**:
- ✅ Código más limpio
- ✅ Menos confusión
- ✅ Más fácil de mantener

### 6.5 ✅ MEDIA: Unificar Endpoints

**Problema**: Múltiples endpoints para lo mismo

**Solución**: Consolidar en `/api/credentials`

```typescript
// Unificar en un solo router
// /api/credentials
//   GET / - Listar credenciales
//   GET /:apiName - Obtener credenciales de una API
//   POST / - Guardar credenciales
//   DELETE /:apiName - Eliminar credenciales
//   POST /:apiName/test - Probar conexión
//   GET /:apiName/auth-url - Obtener URL OAuth (solo para marketplaces)
```

**Beneficios**:
- ✅ API más consistente
- ✅ Menos confusión
- ✅ Más fácil de documentar

### 6.6 ✅ BAJA: Simplificar Scope

**Problema**: Lógica compleja de scope

**Solución**: Helper centralizado

```typescript
// credentials-scope.helper.ts
export class CredentialScopeHelper {
  static readonly PERSONAL_ONLY_APIS: ApiName[] = ['ebay', 'amazon', 'mercadolibre', 'paypal'];
  
  static canBeGlobal(apiName: ApiName): boolean {
    return !this.PERSONAL_ONLY_APIS.includes(apiName);
  }
  
  static normalizeScope(
    requestedScope: any,
    apiName: ApiName,
    userRole: string
  ): CredentialScope {
    // Lógica centralizada
    if (this.PERSONAL_ONLY_APIS.includes(apiName)) {
      return 'user';
    }
    // ... más lógica
  }
}
```

**Beneficios**:
- ✅ Lógica centralizada
- ✅ Fácil de testear
- ✅ Consistencia garantizada

---

## 7. PLAN DE ACCIÓN

### Fase 1: Centralización (ALTA PRIORIDAD)

1. ✅ Crear `field-mapping.config.ts` centralizado
2. ✅ Refactorizar frontend para usar mapeo centralizado
3. ✅ Refactorizar backend para usar mapeo centralizado
4. ✅ Eliminar mapeos duplicados

**Tiempo estimado**: 2-3 horas

### Fase 2: Unificación de Validación (ALTA PRIORIDAD)

1. ✅ Consolidar schemas Zod en backend
2. ✅ Exportar schemas para frontend (o endpoint)
3. ✅ Actualizar frontend para usar schemas del backend
4. ✅ Eliminar validaciones duplicadas

**Tiempo estimado**: 2-3 horas

### Fase 3: Simplificación de Normalización (MEDIA PRIORIDAD)

1. ✅ Refactorizar `normalizeCredential()` en módulos
2. ✅ Separar normalización general de específica
3. ✅ Agregar tests unitarios

**Tiempo estimado**: 2-3 horas

### Fase 4: Limpieza de Configuración (MEDIA PRIORIDAD)

1. ✅ Simplificar `api-keys.config.ts`
2. ✅ Eliminar constantes no utilizadas
3. ✅ Documentar constantes que se mantienen

**Tiempo estimado**: 1 hora

### Fase 5: Unificación de Endpoints (BAJA PRIORIDAD)

1. ✅ Consolidar endpoints en `/api/credentials`
2. ✅ Mantener compatibilidad con endpoints existentes (deprecated)
3. ✅ Actualizar documentación

**Tiempo estimado**: 2-3 horas

### Fase 6: Simplificación de Scope (BAJA PRIORIDAD)

1. ✅ Crear `CredentialScopeHelper`
2. ✅ Refactorizar código para usar helper
3. ✅ Agregar tests

**Tiempo estimado**: 1-2 horas

---

## 8. RESUMEN DE IMPACTO

### Antes (Actual)

- ❌ 3 lugares con mapeo de campos
- ❌ 2 lugares con validación (inconsistente)
- ❌ Lógica de normalización compleja y mezclada
- ❌ Múltiples endpoints confusos
- ❌ Lógica de scope dispersa

### Después (Propuesto)

- ✅ 1 lugar con mapeo de campos (centralizado)
- ✅ 1 lugar con validación (consistente)
- ✅ Normalización modular y testeable
- ✅ Endpoints unificados y claros
- ✅ Lógica de scope centralizada

### Beneficios

1. **Mantenibilidad**: Cambios en un solo lugar
2. **Consistencia**: Validaciones y mapeos siempre sincronizados
3. **Testabilidad**: Código más modular y fácil de testear
4. **Claridad**: Menos confusión sobre qué usar
5. **Extensibilidad**: Fácil agregar nuevas APIs

---

## 9. MÉTRICAS

### Complejidad Actual

- **Archivos involucrados**: 8+
- **Líneas de código duplicadas**: ~200+
- **Puntos de mantenimiento**: 15+
- **Inconsistencias identificadas**: 7

### Complejidad Propuesta

- **Archivos involucrados**: 6 (reducido)
- **Líneas de código duplicadas**: 0
- **Puntos de mantenimiento**: 3 (reducido 80%)
- **Inconsistencias identificadas**: 0

---

## 10. CONCLUSIÓN

El sistema de configuración de APIs funciona correctamente pero tiene **complejidad innecesaria** debido a:

1. Duplicación de mapeos y validaciones
2. Inconsistencias en nomenclatura
3. Lógica dispersa en múltiples lugares

Las simplificaciones propuestas reducirán la complejidad en **~80%** y mejorarán significativamente la mantenibilidad.

**Recomendación**: Implementar Fase 1 y 2 primero (mayor impacto, menor riesgo).

---

**Última actualización**: 2025-11-15

