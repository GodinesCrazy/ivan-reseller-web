# 🔍 AUDITORÍA COMPLETA DEL SISTEMA DE APIs

**Fecha:** 4 de noviembre de 2025  
**Sistema:** Ivan Reseller Web  
**Enfoque:** Consistencia de APIs, Configuración y Uso

---

## 📋 RESUMEN EJECUTIVO

### Estado General: ⚠️ **INCONSISTENCIAS CRÍTICAS DETECTADAS**

```
✅ ASPECTOS POSITIVOS:     7/10
⚠️ INCONSISTENCIAS:        8 problemas
❌ CRÍTICOS:               3 problemas
🔧 RECOMENDACIONES:        12 mejoras
```

### Puntuación por Área:
- **Seguridad:** 9/10 ✅ (Encriptación AES-256-GCM implementada)
- **Configuración:** 6/10 ⚠️ (Falta separación Sandbox/Production)
- **Consistencia:** 5/10 ⚠️ (Nombres de variables inconsistentes)
- **Documentación:** 8/10 ✅ (Bien documentado)
- **Integración:** 7/10 ⚠️ (Algunos servicios usan process.env directamente)

---

## 🎯 HALLAZGOS PRINCIPALES

### ✅ ASPECTOS POSITIVOS

#### 1. Sistema de Encriptación Robusto
```typescript
// backend/src/routes/settings.routes.ts + api-credentials.routes.ts
- Algoritmo: AES-256-GCM ✅
- IV aleatorio por cada encriptación ✅
- Auth Tag para verificación de integridad ✅
- Key de 32 bytes desde ENCRYPTION_KEY env ✅
```

#### 2. Modelo de Base de Datos Bien Estructurado
```prisma
// backend/prisma/schema.prisma
model ApiCredential {
  id            Int       @id @default(autoincrement())
  userId        Int
  apiName       String    // ✅ Normalizado
  credentials   String    // ✅ JSON encriptado
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([userId, apiName])  // ✅ Constraint único por usuario
  @@map("api_credentials")
}
```

#### 3. API REST Completa
```
✅ GET    /api/settings/apis           - Lista todas las APIs disponibles
✅ POST   /api/settings/apis/:apiId    - Guarda configuración
✅ DELETE /api/settings/apis/:apiId    - Elimina configuración
✅ GET    /api/credentials             - Lista credenciales del usuario
✅ GET    /api/credentials/status      - Estado de todas las APIs
✅ GET    /api/credentials/:apiName    - Obtiene credenciales específicas
✅ POST   /api/credentials             - Crea/actualiza credenciales
```

#### 4. Validación con Zod Implementada
```typescript
// backend/src/api/routes/api-credentials.routes.ts
const apiSchemas = {
  ebay: z.object({ EBAY_APP_ID: z.string().min(1), ... }),
  amazon: z.object({ AMAZON_CLIENT_ID: z.string().min(1), ... }),
  // ✅ Validación por tipo de API
}
```

#### 5. Sistema de Disponibilidad de APIs
```typescript
// backend/src/services/api-availability.service.ts
- Verificación de estado de cada API
- Capacidades por API
- Detección automática de configuración
```

#### 6. Servicios Especializados por Marketplace
```
✅ ebay.service.ts          - Completo con OAuth2
✅ amazon.service.ts        - SP-API con AWS SigV4
✅ mercadolibre.service.ts  - OAuth2 implementado
✅ paypal-payout.service.ts - Pagos automáticos
✅ aliexpress-auto-purchase.service.ts - Puppeteer
```

#### 7. Documentación Exhaustiva
```
✅ LISTADO_COMPLETO_APIS.md         - 15 APIs documentadas
✅ CONFIGURACION_APIS_COMPLETA.md   - Setup detallado
✅ RESUMEN_APIS_COMPLETO.md         - Estado actual
✅ GUIA_APIS_FALTANTES.md           - Plan de acción
```

---

## ⚠️ INCONSISTENCIAS DETECTADAS

### 🔴 CRÍTICO 1: Nomenclatura Inconsistente de Variables

**Problema:** Diferentes nombres para las mismas credenciales en distintos archivos.

#### Ejemplo 1: eBay
```typescript
// settings.routes.ts (ID: 1)
EBAY_APP_ID      ✅
EBAY_DEV_ID      ✅
EBAY_CERT_ID     ✅
EBAY_AUTH_TOKEN  ⚠️ (debería ser EBAY_TOKEN)

// api-credentials.routes.ts
EBAY_APP_ID      ✅
EBAY_DEV_ID      ✅
EBAY_CERT_ID     ✅
EBAY_TOKEN       ⚠️ (diferente nombre)

// ebay.service.ts (línea 130)
process.env.EBAY_APP_ID       ✅
process.env.EBAY_DEV_ID       ✅
process.env.EBAY_CERT_ID      ✅
process.env.EBAY_OAUTH_TOKEN  ❌ (tercer nombre diferente!)
process.env.EBAY_REFRESH_TOKEN ❌ (no está en settings.routes!)

// demo-server.ts
EBAY_USER_TOKEN  ❌ (cuarto nombre!)
```

**Impacto:** Las credenciales guardadas en la DB no coinciden con lo que esperan los servicios.

#### Ejemplo 2: Amazon
```typescript
// settings.routes.ts
AMAZON_SELLER_ID            ✅
AMAZON_CLIENT_ID            ✅
AMAZON_CLIENT_SECRET        ✅
AMAZON_REFRESH_TOKEN        ✅
AMAZON_ACCESS_KEY_ID        ✅
AMAZON_SECRET_ACCESS_KEY    ✅
AMAZON_REGION               ✅
AMAZON_MARKETPLACE_ID       ✅

// amazon.service.ts (línea 532)
process.env.AWS_ACCESS_KEY_ID      ❌ (nombre diferente)
process.env.AWS_SECRET_ACCESS_KEY  ❌ (nombre diferente)
process.env.AMAZON_ACCESS_KEY      ❌ (tercer nombre)
process.env.AMAZON_SECRET_KEY      ❌ (cuarto nombre)

// demo-server.ts
AMAZON_ACCESS_KEY     ❌ (quinto nombre!)
AMAZON_SECRET_KEY     ❌ (sexto nombre!)
AMAZON_ASSOCIATE_TAG  ❌ (no está en settings!)
```

#### Ejemplo 3: ScraperAPI
```typescript
// settings.routes.ts
SCRAPERAPI_KEY  ✅

// api-credentials.routes.ts
SCRAPERAPI_KEY  ✅

// scraping.service.ts (línea 58)
process.env.SCRAPERAPI_KEY  ✅ (consistente! 🎉)
```

---

### 🔴 CRÍTICO 2: Falta Separación Sandbox/Production

**Problema:** Las APIs de marketplaces NO tienen separación entre ambientes sandbox y production.

#### Estado Actual:
```typescript
// settings.routes.ts
{
  id: 1,
  name: 'eBay API',
  environment: 'sandbox',  // ⚠️ Solo UN ambiente
  fields: [
    { key: 'EBAY_APP_ID', ... },      // ⚠️ Mismas keys para ambos
    { key: 'EBAY_DEV_ID', ... },
    { key: 'EBAY_CERT_ID', ... },
    { key: 'EBAY_AUTH_TOKEN', ... }
  ]
}
```

#### Configuración Real de eBay:
```
Sandbox:
- App ID:    different_sandbox_id
- Dev ID:    same_for_both
- Cert ID:   different_sandbox_cert
- Endpoint:  https://api.sandbox.ebay.com

Production:
- App ID:    different_production_id
- Dev ID:    same_for_both
- Cert ID:   different_production_cert
- Endpoint:  https://api.ebay.com
```

**Impacto:** 
- ❌ No se pueden configurar credenciales sandbox Y production simultáneamente
- ❌ Al cambiar de ambiente, hay que reconfigurar todas las credenciales
- ❌ Riesgo de publicar productos reales con credenciales de testing

**Solución Requerida:**
```typescript
// Propuesta de estructura
{
  id: 1,
  name: 'eBay API',
  environments: ['sandbox', 'production'],  // ✅ Múltiples ambientes
  fields: {
    sandbox: [
      { key: 'EBAY_SANDBOX_APP_ID', ... },
      { key: 'EBAY_SANDBOX_DEV_ID', ... },
      { key: 'EBAY_SANDBOX_CERT_ID', ... },
      { key: 'EBAY_SANDBOX_AUTH_TOKEN', ... }
    ],
    production: [
      { key: 'EBAY_PRODUCTION_APP_ID', ... },
      { key: 'EBAY_PRODUCTION_DEV_ID', ... },
      { key: 'EBAY_PRODUCTION_CERT_ID', ... },
      { key: 'EBAY_PRODUCTION_AUTH_TOKEN', ... }
    ]
  }
}
```

---

### 🔴 CRÍTICO 3: SystemConfig vs ApiCredential - Doble Almacenamiento

**Problema:** Hay DOS sistemas de almacenamiento de credenciales que NO están sincronizados.

#### Sistema 1: SystemConfig (settings.routes.ts)
```typescript
// Línea 187-199
await prisma.systemConfig.upsert({
  where: { key },
  create: {
    key,
    value: JSON.stringify(encrypted),  // ⚠️ Formato diferente
    description: `${name} - ${key}`,
    isEncrypted: true
  },
  ...
});
```

#### Sistema 2: ApiCredential (api-credentials.routes.ts)
```typescript
// Línea 200+
await prisma.apiCredential.upsert({
  where: {
    userId_apiName: { userId, apiName },  // ⚠️ Estructura diferente
  },
  create: {
    userId,
    apiName,
    credentials: encryptCredentials(credentials),  // ⚠️ Formato diferente
    isActive,
  },
  ...
});
```

**Diferencias Críticas:**

| Aspecto | SystemConfig | ApiCredential |
|---------|--------------|---------------|
| **Scope** | Global (sin userId) | Por usuario |
| **Formato** | Un key por campo | JSON con todos los campos |
| **Encriptación** | `{ encrypted, iv, tag }` | Base64 con IV+TAG+DATA |
| **Indexación** | Por `key` único | Por `userId + apiName` |
| **Usado por** | `/api/settings/apis` | `/api/credentials` |

**Impacto:**
- ❌ Credenciales guardadas en settings.routes NO están en api-credentials
- ❌ Servicios buscan en ApiCredential pero el usuario configura en SystemConfig
- ❌ `/api/credentials/status` NO refleja lo guardado en `/api/settings/apis`

---

### ⚠️ PROBLEMA 4: Services Usando process.env Directamente

**Problema:** Algunos servicios ignoran la base de datos y leen directamente de variables de entorno.

#### Servicios Problemáticos:

```typescript
// ebay.service.ts (línea 130)
static fromEnv(): EbayService | null {
  const appId = process.env.EBAY_APP_ID;       // ⚠️ Bypass DB
  const devId = process.env.EBAY_DEV_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !devId || !certId) return null;
  // ...
}

// amazon.service.ts (línea 532)
const accessKeyId = this.credentials?.awsAccessKeyId 
  || process.env.AWS_ACCESS_KEY_ID        // ⚠️ Fallback a env
  || process.env.AMAZON_ACCESS_KEY || '';

// paypal-payout.service.ts (línea 90)
const clientId = process.env.PAYPAL_CLIENT_ID;     // ⚠️ Bypass DB
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const environment = process.env.PAYPAL_ENVIRONMENT || 'sandbox';
```

**Impacto:**
- ⚠️ Las credenciales configuradas en la UI pueden no usarse
- ⚠️ Requiere configuración en Railway además de en la aplicación
- ⚠️ Multi-tenant no funcionará correctamente (todos los usuarios usan las mismas env vars)

---

### ⚠️ PROBLEMA 5: APIs Faltantes en Configuración

**Problema:** Hay 6 APIs mencionadas en documentación que NO están en `settings.routes.ts`:

```typescript
// Implementadas en settings.routes.ts (9):
✅ eBay API
✅ Amazon SP-API
✅ MercadoLibre API
✅ GROQ AI API
✅ ScraperAPI
✅ ZenRows API
✅ 2Captcha
✅ PayPal Payouts API
✅ AliExpress Auto-Purchase

// Faltantes (6):
❌ Email SMTP (Nodemailer)      - Usado en notifications.service.ts
❌ Twilio API                   - Usado en notifications.service.ts
❌ Slack API                    - Usado en notifications.service.ts
❌ OpenAI API (opcional)        - Mencionado en documentación
❌ Stripe API (opcional)        - Mencionado en documentación
❌ Webhooks URLs                - Necesarios para recibir notificaciones
```

**Archivos que usan APIs no configurables:**

```typescript
// backend/src/services/notifications.service.ts (línea 1)
import nodemailer from 'nodemailer';
// ⚠️ Configuración hardcodeada, no en DB
```

---

### ⚠️ PROBLEMA 6: Validación Inconsistente

**Problema:** Las validaciones Zod en `api-credentials.routes.ts` NO coinciden con los campos en `settings.routes.ts`.

#### Amazon - Campos en settings.routes.ts:
```typescript
AMAZON_SELLER_ID          ✅
AMAZON_CLIENT_ID          ✅
AMAZON_CLIENT_SECRET      ✅
AMAZON_REFRESH_TOKEN      ✅
AMAZON_ACCESS_KEY_ID      ✅
AMAZON_SECRET_ACCESS_KEY  ✅
AMAZON_REGION             ✅
AMAZON_MARKETPLACE_ID     ✅
```

#### Amazon - Validación en api-credentials.routes.ts:
```typescript
amazon: z.object({
  AMAZON_CLIENT_ID: z.string().min(1),       ✅
  AMAZON_CLIENT_SECRET: z.string().min(1),   ✅
  AMAZON_REFRESH_TOKEN: z.string().min(1),   ✅
  AMAZON_REGION: z.string().default('us-east-1'),  ✅
  // ❌ Faltan 4 campos: SELLER_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY, MARKETPLACE_ID
}),
```

**Impacto:**
- ❌ POST a `/api/credentials` con todos los campos será rechazado por Zod
- ❌ Los servicios esperan campos que la validación no permite

---

### ⚠️ PROBLEMA 7: demo-server.ts con Estructura Antigua

**Problema:** `backend/src/demo-server.ts` tiene una estructura de APIs diferente y obsoleta.

```typescript
// demo-server.ts - APIs definidas
{
  id: 1,
  name: 'eBay API',           // ✅ Mismo nombre
  fields: [
    { key: 'EBAY_APP_ID', ... },      // ✅
    { key: 'EBAY_CERT_ID', ... },     // ✅
    { key: 'EBAY_DEV_ID', ... },      // ✅
    { key: 'EBAY_USER_TOKEN', ... }   // ❌ Nombre diferente (vs EBAY_AUTH_TOKEN)
  ]
},
{
  id: 2,
  name: 'Amazon API',         // ⚠️ Diferente (vs "Amazon SP-API")
  fields: [
    { key: 'AMAZON_ACCESS_KEY', ... },    // ❌ Diferente
    { key: 'AMAZON_SECRET_KEY', ... },    // ❌ Diferente
    { key: 'AMAZON_ASSOCIATE_TAG', ... }  // ❌ No existe en settings
  ]
}
```

**Impacto:**
- ⚠️ Si alguien usa demo-server.ts, configurará campos incorrectos
- ⚠️ Confusión sobre nombres correctos de variables

---

### ⚠️ PROBLEMA 8: Falta Documentación de Campos en Servicios

**Problema:** Los servicios esperan ciertos campos pero no está documentado claramente.

#### Ejemplo: amazon.service.ts
```typescript
// ¿Qué campos espera realmente?
export interface AmazonCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  region?: string;
  marketplaceId?: string;
  awsAccessKeyId?: string;      // ⚠️ Opcional pero necesario para SP-API
  awsSecretAccessKey?: string;  // ⚠️ Opcional pero necesario para SP-API
  awsSessionToken?: string;     // ⚠️ No está en settings.routes.ts
  sellerId?: string;            // ⚠️ No está en settings.routes.ts
}
```

#### Ejemplo: ebay.service.ts
```typescript
export interface EbayCredentials {
  appId: string;
  devId: string;
  certId: string;
  token?: string;
  refreshToken?: string;  // ⚠️ No está en settings.routes.ts
  sandbox: boolean;       // ⚠️ No está en settings.routes.ts
}
```

---

## 🔧 RECOMENDACIONES

### 1. UNIFICAR NOMENCLATURA (CRÍTICO)

**Crear un archivo de constantes centralizado:**

```typescript
// backend/src/config/api-keys.config.ts

export const API_KEY_NAMES = {
  EBAY: {
    APP_ID: 'EBAY_APP_ID',
    DEV_ID: 'EBAY_DEV_ID',
    CERT_ID: 'EBAY_CERT_ID',
    AUTH_TOKEN: 'EBAY_AUTH_TOKEN',
    REFRESH_TOKEN: 'EBAY_REFRESH_TOKEN',
    SANDBOX: {
      APP_ID: 'EBAY_SANDBOX_APP_ID',
      DEV_ID: 'EBAY_SANDBOX_DEV_ID',
      CERT_ID: 'EBAY_SANDBOX_CERT_ID',
      AUTH_TOKEN: 'EBAY_SANDBOX_AUTH_TOKEN',
    },
    PRODUCTION: {
      APP_ID: 'EBAY_PRODUCTION_APP_ID',
      DEV_ID: 'EBAY_PRODUCTION_DEV_ID',
      CERT_ID: 'EBAY_PRODUCTION_CERT_ID',
      AUTH_TOKEN: 'EBAY_PRODUCTION_AUTH_TOKEN',
    }
  },
  AMAZON: {
    SELLER_ID: 'AMAZON_SELLER_ID',
    CLIENT_ID: 'AMAZON_CLIENT_ID',
    CLIENT_SECRET: 'AMAZON_CLIENT_SECRET',
    REFRESH_TOKEN: 'AMAZON_REFRESH_TOKEN',
    ACCESS_KEY_ID: 'AMAZON_ACCESS_KEY_ID',
    SECRET_ACCESS_KEY: 'AMAZON_SECRET_ACCESS_KEY',
    REGION: 'AMAZON_REGION',
    MARKETPLACE_ID: 'AMAZON_MARKETPLACE_ID',
    SANDBOX: { /* ... */ },
    PRODUCTION: { /* ... */ }
  },
  // ... resto de APIs
} as const;

// Usar en todos los archivos
import { API_KEY_NAMES } from '@/config/api-keys.config';
```

---

### 2. IMPLEMENTAR SEPARACIÓN SANDBOX/PRODUCTION (CRÍTICO)

**Actualizar estructura en settings.routes.ts:**

```typescript
const apis = [
  {
    id: 1,
    name: 'eBay API',
    category: 'marketplace',
    supportsEnvironments: true,
    environments: {
      sandbox: {
        status: 'not_configured',
        endpoint: 'https://api.sandbox.ebay.com',
        fields: [
          { key: 'EBAY_SANDBOX_APP_ID', label: 'App ID', required: true, type: 'text' },
          { key: 'EBAY_SANDBOX_DEV_ID', label: 'Dev ID', required: true, type: 'text' },
          { key: 'EBAY_SANDBOX_CERT_ID', label: 'Cert ID', required: true, type: 'password' },
          { key: 'EBAY_SANDBOX_AUTH_TOKEN', label: 'Auth Token', required: false, type: 'password' }
        ]
      },
      production: {
        status: 'not_configured',
        endpoint: 'https://api.ebay.com',
        fields: [
          { key: 'EBAY_PRODUCTION_APP_ID', label: 'App ID', required: true, type: 'text' },
          { key: 'EBAY_PRODUCTION_DEV_ID', label: 'Dev ID', required: true, type: 'text' },
          { key: 'EBAY_PRODUCTION_CERT_ID', label: 'Cert ID', required: true, type: 'password' },
          { key: 'EBAY_PRODUCTION_AUTH_TOKEN', label: 'Auth Token', required: false, type: 'password' }
        ]
      }
    }
  }
];
```

---

### 3. UNIFICAR ALMACENAMIENTO (CRÍTICO)

**Opción A: Usar SOLO ApiCredential (Recomendado)**

```typescript
// Eliminar uso de SystemConfig para APIs
// Migrar todo a ApiCredential que es por usuario

// Ventajas:
// - Multi-tenant nativo
// - Una sola fuente de verdad
// - Mejor control de acceso
```

**Opción B: Usar SOLO SystemConfig (No recomendado para multi-tenant)**

```typescript
// Si es single-tenant, usar SystemConfig
// Pero perderías capacidad de tener diferentes credenciales por usuario
```

---

### 4. ELIMINAR ACCESO DIRECTO A process.env

**Refactorizar todos los servicios:**

```typescript
// ❌ ANTES
static fromEnv(): EbayService | null {
  const appId = process.env.EBAY_APP_ID;
  // ...
}

// ✅ DESPUÉS
static async fromDatabase(userId: number): Promise<EbayService | null> {
  const credentials = await prisma.apiCredential.findFirst({
    where: { userId, apiName: 'ebay' }
  });
  if (!credentials) return null;
  const decrypted = decryptCredentials(credentials.credentials);
  return new EbayService({
    appId: decrypted.EBAY_APP_ID,
    // ...
  });
}
```

---

### 5. SINCRONIZAR VALIDACIONES ZOD

**Actualizar api-credentials.routes.ts:**

```typescript
const apiSchemas = {
  ebay: z.object({
    EBAY_APP_ID: z.string().min(1),
    EBAY_DEV_ID: z.string().min(1),
    EBAY_CERT_ID: z.string().min(1),
    EBAY_AUTH_TOKEN: z.string().optional(),
    EBAY_REFRESH_TOKEN: z.string().optional(),  // ✅ Agregar
    // Para sandbox/production, validar según ambiente
  }),
  amazon: z.object({
    AMAZON_SELLER_ID: z.string().min(1),           // ✅ Agregar
    AMAZON_CLIENT_ID: z.string().min(1),
    AMAZON_CLIENT_SECRET: z.string().min(1),
    AMAZON_REFRESH_TOKEN: z.string().min(1),
    AMAZON_ACCESS_KEY_ID: z.string().min(1),       // ✅ Agregar
    AMAZON_SECRET_ACCESS_KEY: z.string().min(1),   // ✅ Agregar
    AMAZON_REGION: z.string().default('us-east-1'),
    AMAZON_MARKETPLACE_ID: z.string().min(1),      // ✅ Agregar
  }),
  // ... resto
};
```

---

### 6. AGREGAR APIs FALTANTES

**Agregar a settings.routes.ts:**

```typescript
// ID: 10
{
  id: 10,
  name: 'Email SMTP',
  category: 'notifications',
  fields: [
    { key: 'EMAIL_HOST', label: 'SMTP Host', required: true, type: 'text' },
    { key: 'EMAIL_PORT', label: 'SMTP Port', required: true, type: 'text' },
    { key: 'EMAIL_USER', label: 'Email User', required: true, type: 'text' },
    { key: 'EMAIL_PASSWORD', label: 'Email Password', required: true, type: 'password' },
    { key: 'EMAIL_FROM', label: 'From Address', required: true, type: 'text' },
    { key: 'EMAIL_SECURE', label: 'Use TLS', required: false, type: 'text' }
  ]
},
// ID: 11 - Twilio
// ID: 12 - Slack
// etc...
```

---

### 7. DEPRECAR demo-server.ts

```typescript
// Agregar aviso en el archivo
/**
 * @deprecated Este archivo usa estructura antigua de APIs
 * Usar settings.routes.ts como fuente de verdad
 * Este archivo se mantiene solo para compatibilidad legacy
 */
```

---

### 8. DOCUMENTAR INTERFACES CLARAMENTE

**Crear archivo de tipos:**

```typescript
// backend/src/types/api-credentials.types.ts

export interface EbayCredentials {
  /** eBay Application ID (Client ID) */
  appId: string;
  /** eBay Developer ID */
  devId: string;
  /** eBay Certificate ID (Client Secret) */
  certId: string;
  /** OAuth 2.0 User Token (optional, auto-generated) */
  token?: string;
  /** OAuth 2.0 Refresh Token for token renewal */
  refreshToken?: string;
  /** Whether to use sandbox environment */
  sandbox: boolean;
}

export interface AmazonCredentials {
  /** Amazon Seller ID (e.g., A2XXXXXXXXXX) */
  sellerId: string;
  /** LWA Client ID */
  clientId: string;
  /** LWA Client Secret */
  clientSecret: string;
  /** LWA Refresh Token */
  refreshToken: string;
  /** LWA Access Token (auto-generated) */
  accessToken?: string;
  /** AWS Access Key ID for SP-API signing */
  awsAccessKeyId: string;
  /** AWS Secret Access Key for SP-API signing */
  awsSecretAccessKey: string;
  /** AWS Session Token (optional, for temporary credentials) */
  awsSessionToken?: string;
  /** AWS Region (e.g., us-east-1) */
  region: string;
  /** Amazon Marketplace ID (e.g., ATVPDKIKX0DER for US) */
  marketplaceId: string;
}

// ... resto de interfaces documentadas
```

---

### 9. AGREGAR TESTS UNITARIOS

```typescript
// backend/tests/api-credentials.test.ts

describe('API Credentials', () => {
  it('should encrypt and decrypt credentials correctly', () => {
    const original = { API_KEY: 'secret123' };
    const encrypted = encryptCredentials(original);
    const decrypted = decryptCredentials(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('should validate eBay credentials with Zod', () => {
    const valid = { EBAY_APP_ID: 'app123', EBAY_DEV_ID: 'dev123', EBAY_CERT_ID: 'cert123' };
    expect(() => apiSchemas.ebay.parse(valid)).not.toThrow();
  });

  it('should reject invalid credentials', () => {
    const invalid = { EBAY_APP_ID: '' };
    expect(() => apiSchemas.ebay.parse(invalid)).toThrow();
  });
});
```

---

### 10. CREAR SERVICIO CENTRALIZADO DE CREDENCIALES

```typescript
// backend/src/services/credentials-manager.service.ts

export class CredentialsManager {
  /**
   * Obtener credenciales de cualquier API para un usuario
   */
  static async getCredentials<T>(
    userId: number, 
    apiName: string, 
    environment?: 'sandbox' | 'production'
  ): Promise<T | null> {
    const keyPrefix = environment ? `${apiName.toUpperCase()}_${environment.toUpperCase()}` : apiName.toUpperCase();
    
    const credential = await prisma.apiCredential.findFirst({
      where: { userId, apiName }
    });
    
    if (!credential) return null;
    
    const decrypted = decryptCredentials(credential.credentials);
    
    // Filtrar solo las keys del ambiente solicitado
    if (environment) {
      const filtered: any = {};
      for (const [key, value] of Object.entries(decrypted)) {
        if (key.startsWith(keyPrefix)) {
          // Remover prefijo del ambiente
          const cleanKey = key.replace(`${keyPrefix}_`, '');
          filtered[cleanKey] = value;
        }
      }
      return filtered as T;
    }
    
    return decrypted as T;
  }

  /**
   * Guardar credenciales con validación automática
   */
  static async saveCredentials(
    userId: number,
    apiName: string,
    credentials: Record<string, string>,
    environment?: 'sandbox' | 'production'
  ): Promise<void> {
    // Validar con Zod según el tipo de API
    const schema = apiSchemas[apiName];
    if (schema) {
      schema.parse(credentials);
    }
    
    // Encriptar y guardar
    const encrypted = encryptCredentials(credentials);
    await prisma.apiCredential.upsert({
      where: { userId_apiName: { userId, apiName } },
      create: { userId, apiName, credentials: encrypted },
      update: { credentials: encrypted, updatedAt: new Date() }
    });
  }
}
```

---

### 11. MIGRACIÓN DE DATOS

```typescript
// backend/scripts/migrate-api-credentials.ts

/**
 * Migrar credenciales de SystemConfig a ApiCredential
 */
async function migrateCredentials() {
  // 1. Obtener todas las configs de APIs
  const configs = await prisma.systemConfig.findMany({
    where: {
      key: {
        in: [
          'EBAY_APP_ID', 'EBAY_DEV_ID', 'EBAY_CERT_ID',
          'AMAZON_CLIENT_ID', 'AMAZON_CLIENT_SECRET',
          // ... todas las keys
        ]
      }
    }
  });

  // 2. Agrupar por API
  const grouped = groupByAPI(configs);

  // 3. Para cada API, crear ApiCredential
  for (const [apiName, keys] of Object.entries(grouped)) {
    const credentials: Record<string, string> = {};
    for (const config of keys) {
      const decrypted = JSON.parse(config.value);
      credentials[config.key] = decrypt(decrypted);
    }

    // 4. Guardar en ApiCredential para un usuario admin
    await prisma.apiCredential.create({
      data: {
        userId: 1, // Admin
        apiName,
        credentials: encryptCredentials(credentials),
      }
    });
  }

  console.log('Migration completed');
}
```

---

### 12. ACTUALIZAR FRONTEND

```typescript
// frontend/src/pages/APIConfiguration.tsx

// Agregar toggle para sandbox/production
const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');

// Mostrar campos según ambiente seleccionado
<div className="mb-4">
  <label className="block text-sm font-medium mb-2">Environment</label>
  <div className="flex gap-2">
    <button
      onClick={() => setEnvironment('sandbox')}
      className={environment === 'sandbox' ? 'btn-primary' : 'btn-secondary'}
    >
      Sandbox
    </button>
    <button
      onClick={() => setEnvironment('production')}
      className={environment === 'production' ? 'btn-primary' : 'btn-secondary'}
    >
      Production
    </button>
  </div>
</div>

// Renderizar campos del ambiente seleccionado
{api.environments[environment].fields.map(field => (
  <div key={field.key}>
    <label>{field.label}</label>
    <input
      type={field.type}
      name={field.key}
      placeholder={field.placeholder}
      required={field.required}
    />
  </div>
))}
```

---

## 📊 RESUMEN DE CAMBIOS REQUERIDOS

### Prioridad ALTA (Críticos):
```
1. ✅ Unificar nomenclatura de variables      - 2 días
2. ✅ Implementar sandbox/production          - 3 días
3. ✅ Unificar almacenamiento (ApiCredential) - 2 días
4. ✅ Eliminar process.env directo            - 2 días
5. ✅ Sincronizar validaciones Zod            - 1 día
                                      TOTAL: 10 días
```

### Prioridad MEDIA:
```
6. ✅ Agregar APIs faltantes (Email, Twilio, Slack)  - 3 días
7. ✅ Documentar interfaces claramente               - 1 día
8. ✅ Crear CredentialsManager service               - 2 días
9. ✅ Actualizar frontend con toggle sandbox/prod    - 2 días
                                             TOTAL: 8 días
```

### Prioridad BAJA:
```
10. ✅ Deprecar demo-server.ts           - 1 día
11. ✅ Agregar tests unitarios           - 3 días
12. ✅ Script de migración de datos      - 1 día
                                 TOTAL: 5 días
```

**TIEMPO TOTAL ESTIMADO: 23 días de desarrollo**

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

```markdown
### Fase 1: Fixes Críticos (10 días)
- [ ] Crear archivo `api-keys.config.ts` con constantes
- [ ] Actualizar `settings.routes.ts` con estructura sandbox/production
- [ ] Actualizar `api-credentials.routes.ts` con nuevos campos
- [ ] Refactorizar servicios para NO usar process.env
- [ ] Sincronizar validaciones Zod con campos reales
- [ ] Eliminar uso de SystemConfig para APIs
- [ ] Migrar datos existentes a ApiCredential

### Fase 2: Mejoras (8 días)
- [ ] Agregar Email SMTP a settings.routes.ts
- [ ] Agregar Twilio API a settings.routes.ts
- [ ] Agregar Slack API a settings.routes.ts
- [ ] Crear `api-credentials.types.ts` con interfaces documentadas
- [ ] Crear `CredentialsManager` service
- [ ] Actualizar frontend con toggle sandbox/production
- [ ] Agregar indicador visual de ambiente activo

### Fase 3: Calidad (5 días)
- [ ] Agregar aviso de deprecación en demo-server.ts
- [ ] Crear suite de tests para encriptación
- [ ] Crear tests para validaciones Zod
- [ ] Crear script de migración de datos
- [ ] Documentar proceso de configuración de APIs
```

---

## 📈 MÉTRICAS DE ÉXITO

Al completar todas las recomendaciones:

```
Seguridad:        9/10 → 10/10 ✅
Configuración:    6/10 → 10/10 ✅
Consistencia:     5/10 → 10/10 ✅
Documentación:    8/10 → 10/10 ✅
Integración:      7/10 → 10/10 ✅

PUNTUACIÓN FINAL: 10/10 🎉
```

---

## 🎯 CONCLUSIÓN

El sistema de APIs tiene una **base sólida** (encriptación, estructura DB, validación) pero sufre de **inconsistencias críticas** que afectan la usabilidad y mantenibilidad:

### Problemas Principales:
1. ❌ Nomenclatura inconsistente entre archivos
2. ❌ Falta separación sandbox/production
3. ❌ Doble sistema de almacenamiento (SystemConfig vs ApiCredential)
4. ⚠️ Servicios usando process.env en lugar de DB
5. ⚠️ APIs faltantes (Email, Twilio, Slack)

### Impacto en Producción:
- 🔴 **Crítico:** Usuario configura credenciales pero servicios no las encuentran
- 🔴 **Crítico:** No se puede usar sandbox y production simultáneamente
- 🟡 **Moderado:** Requiere configuración manual en Railway además de UI
- 🟡 **Moderado:** Multi-tenant no funcionará correctamente

### Recomendación:
**Implementar Fase 1 (10 días) ANTES de deployment a producción.**

Las Fases 2 y 3 pueden hacerse después, pero los fixes críticos son necesarios para que el sistema funcione correctamente en producción.

---

**Auditoría realizada por:** GitHub Copilot  
**Fecha:** 4 de noviembre de 2025  
**Versión del sistema:** Pre-deployment a Railway/Vercel
