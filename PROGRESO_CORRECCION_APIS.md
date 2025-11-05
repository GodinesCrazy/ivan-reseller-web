# 🚀 PROGRESO DE CORRECCIÓN DEL SISTEMA DE APIs

**Fecha:** 4 de noviembre de 2025  
**Sesión:** Corrección Completa - Fase 1  
**Estado:** ✅ 50% Completado

---

## ✅ COMPLETADO (6/12 tareas)

### 1. ✅ Archivo de Constantes de API Keys
**Archivo:** `backend/src/config/api-keys.config.ts`

**Contenido:**
- ✅ Constantes unificadas para TODAS las APIs
- ✅ Separación completa Sandbox/Production
- ✅ Sección Legacy para compatibilidad con código viejo
- ✅ Helpers para obtener keys según ambiente
- ✅ Endpoints por ambiente
- ✅ Mapeo de IDs de APIs

**APIs Incluidas:**
```
1. eBay (Sandbox + Production + Legacy)
2. Amazon (Sandbox + Production + Legacy)
3. MercadoLibre (Sandbox + Production + Legacy)
4. GROQ AI
5. OpenAI
6. ScraperAPI
7. ZenRows
8. 2Captcha
9. PayPal (Sandbox + Production + Legacy)
10. AliExpress
11. Email SMTP
12. Twilio
13. Slack
14. Stripe (Sandbox + Production + Legacy)
```

**Ejemplo de uso:**
```typescript
import { API_KEY_NAMES, getApiKeys } from '@/config/api-keys.config';

// Obtener keys de eBay Production
const ebayKeys = getApiKeys('EBAY', 'production');
// ebayKeys.APP_ID = 'EBAY_PRODUCTION_APP_ID'

// Verificar si soporta ambientes
if (supportsEnvironments('ebay')) {
  // Tiene sandbox y production
}
```

---

### 2. ✅ Tipos de Credenciales
**Archivo:** `backend/src/types/api-credentials.types.ts`

**Contenido:**
- ✅ Interfaces TypeScript documentadas para cada API
- ✅ JSDoc con enlaces a documentación oficial
- ✅ Campos opcionales y requeridos claramente marcados
- ✅ Tipo unión `ApiCredentials` para todas las APIs
- ✅ `ApiCredentialsMap` para type-safety
- ✅ Tipos de helpers: `ApiName`, `ApiEnvironment`, `ApiStatus`

**Interfaces Creadas:**
```typescript
✅ EbayCredentials          - 6 campos (appId, devId, certId, etc.)
✅ AmazonCredentials        - 11 campos (sellerId, clientId, AWS keys, etc.)
✅ MercadoLibreCredentials  - 5 campos (clientId, accessToken, etc.)
✅ GroqCredentials          - 3 campos (apiKey, model, maxTokens)
✅ OpenAICredentials        - 3 campos (apiKey, organization, model)
✅ ScraperAPICredentials    - 2 campos (apiKey, premium)
✅ ZenRowsCredentials       - 2 campos (apiKey, premium)
✅ TwoCaptchaCredentials    - 1 campo (apiKey)
✅ PayPalCredentials        - 3 campos (clientId, clientSecret, environment)
✅ AliExpressCredentials    - 4 campos (email, password, 2FA)
✅ EmailCredentials         - 7 campos (host, port, user, password, etc.)
✅ TwilioCredentials        - 4 campos (accountSid, authToken, phones)
✅ SlackCredentials         - 3 campos (webhook, botToken, channel)
✅ StripeCredentials        - 4 campos (publicKey, secretKey, webhook, sandbox)
```

**Ejemplo de uso:**
```typescript
import type { EbayCredentials } from '@/types/api-credentials.types';

function setupEbay(creds: EbayCredentials) {
  // TypeScript sabe exactamente qué campos existen
  console.log(creds.appId);    // ✅ OK
  console.log(creds.apiKey);   // ❌ Error: no existe
}
```

---

### 3. ✅ Schema de Prisma Actualizado
**Archivo:** `backend/prisma/schema.prisma`

**Cambios:**
```prisma
model ApiCredential {
  id            Int       @id @default(autoincrement())
  userId        Int
  apiName       String
  environment   String    @default("production")  // ✅ NUEVO
  credentials   String
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  user          User      @relation(...)
  
  @@unique([userId, apiName, environment])  // ✅ ACTUALIZADO
  @@map("api_credentials")
}
```

**Impacto:**
- ✅ Ahora cada usuario puede tener credenciales separadas para sandbox Y production
- ✅ Constraint único actualizado: `[userId, apiName, environment]`
- ✅ Por defecto usa "production" para APIs sin ambientes

**Ejemplo de uso:**
```sql
-- Antes (solo un registro por API):
userId=1, apiName='ebay', credentials='...'

-- Ahora (dos registros por API):
userId=1, apiName='ebay', environment='sandbox', credentials='...'
userId=1, apiName='ebay', environment='production', credentials='...'
```

---

### 4. ✅ Cliente de Prisma Regenerado
**Comando ejecutado:** `npx prisma generate`

**Resultado:**
```
✔ Generated Prisma Client (v5.22.0)
```

**Cambios en el cliente:**
- ✅ Nuevo campo `environment` disponible en queries
- ✅ Nuevo constraint `userId_apiName_environment` para upserts
- ✅ TypeScript types actualizados

**Ejemplo de uso:**
```typescript
// Ahora puedes hacer:
await prisma.apiCredential.findFirst({
  where: {
    userId: 1,
    apiName: 'ebay',
    environment: 'sandbox',  // ✅ Nuevo campo
  }
});

// O usar el constraint único:
await prisma.apiCredential.upsert({
  where: {
    userId_apiName_environment: {
      userId: 1,
      apiName: 'ebay',
      environment: 'production',
    }
  },
  // ...
});
```

---

### 5. ✅ CredentialsManager Service
**Archivo:** `backend/src/services/credentials-manager.service.ts`

**Características:**
- ✅ Servicio centralizado para TODO el manejo de credenciales
- ✅ Encriptación/desencriptación AES-256-GCM
- ✅ Validación con Zod integrada
- ✅ Soporte completo de sandbox/production
- ✅ Type-safe con generics de TypeScript

**Métodos Principales:**

#### `getCredentials<T>(userId, apiName, environment)`
```typescript
// Obtener credenciales de eBay Sandbox
const creds = await CredentialsManager.getCredentials(
  userId,
  'ebay',
  'sandbox'
);

// TypeScript sabe que es EbayCredentials
console.log(creds.appId);     // ✅ OK
console.log(creds.clientId);  // ❌ Error
```

#### `saveCredentials<T>(userId, apiName, credentials, environment)`
```typescript
// Guardar credenciales con validación automática
await CredentialsManager.saveCredentials(
  userId,
  'ebay',
  {
    appId: 'APP123',
    devId: 'DEV456',
    certId: 'CERT789',
    sandbox: true,
  },
  'sandbox'
);
// ✅ Valida con Zod antes de guardar
// ✅ Encripta automáticamente
// ✅ Hace upsert (crea o actualiza)
```

#### `deleteCredentials(userId, apiName, environment)`
```typescript
// Eliminar credenciales de Production
await CredentialsManager.deleteCredentials(
  userId,
  'ebay',
  'production'
);
```

#### `hasCredentials(userId, apiName, environment)`
```typescript
// Verificar si tiene configurado Sandbox
const hasIt = await CredentialsManager.hasCredentials(
  userId,
  'ebay',
  'sandbox'
);
// true o false
```

#### `listConfiguredApis(userId)`
```typescript
// Listar todas las APIs configuradas
const apis = await CredentialsManager.listConfiguredApis(userId);
// [
//   { apiName: 'ebay', environment: 'sandbox', isActive: true, ... },
//   { apiName: 'ebay', environment: 'production', isActive: true, ... },
//   { apiName: 'amazon', environment: 'production', isActive: false, ... },
// ]
```

#### `validateCredentials(apiName, credentials)`
```typescript
// Validar sin guardar
const result = CredentialsManager.validateCredentials('ebay', {
  appId: '',  // ❌ Vacío
  devId: 'DEV123',
  certId: 'CERT456',
  sandbox: true,
});

if (!result.valid) {
  console.log(result.errors);
  // ['appId: App ID is required']
}
```

**Esquemas Zod Incluidos:**
```typescript
✅ ebay          - 6 campos validados
✅ amazon        - 11 campos validados
✅ mercadolibre  - 5 campos validados
✅ groq          - 3 campos validados
✅ openai        - 3 campos validados
✅ scraperapi    - 2 campos validados
✅ zenrows       - 2 campos validados
✅ 2captcha      - 1 campo validado
✅ paypal        - 3 campos validados
✅ aliexpress    - 4 campos validados
✅ email         - 7 campos validados
✅ twilio        - 4 campos validados
✅ slack         - 3 campos validados (con refine)
✅ stripe        - 4 campos validados
```

---

### 6. ✅ Auditoría Completa Documentada
**Archivo:** `AUDITORIA_SISTEMA_APIS.md`

**Contenido:**
- ✅ Resumen ejecutivo con puntuación 7/10
- ✅ 7 aspectos positivos identificados
- ✅ 8 inconsistencias críticas documentadas
- ✅ 12 recomendaciones con código de ejemplo
- ✅ Checklist de implementación
- ✅ Estimación de tiempo: 23 días

---

## 🔄 EN PROGRESO (0/12 tareas)

_Ninguna tarea en progreso actualmente_

---

## 📋 PENDIENTE (6/12 tareas)

### 7. ⏳ Actualizar settings.routes.ts
**Objetivo:** Refactorizar para soportar sandbox/production

**Cambios requeridos:**
```typescript
// De:
{
  id: 1,
  name: 'eBay API',
  environment: 'sandbox',  // ❌ Solo uno
  fields: [...]
}

// A:
{
  id: 1,
  name: 'eBay API',
  supportsEnvironments: true,  // ✅ Flag
  environments: {
    sandbox: {
      status: 'not_configured',
      endpoint: 'https://api.sandbox.ebay.com',
      fields: [
        { key: 'EBAY_SANDBOX_APP_ID', ... },
        // ...
      ]
    },
    production: {
      status: 'not_configured',
      endpoint: 'https://api.ebay.com',
      fields: [
        { key: 'EBAY_PRODUCTION_APP_ID', ... },
        // ...
      ]
    }
  }
}
```

**APIs a actualizar:**
- eBay (9 campos × 2 ambientes)
- Amazon (8 campos × 2 ambientes)
- MercadoLibre (4 campos × 2 ambientes)
- PayPal (3 campos × 2 ambientes)
- Stripe (3 campos × 2 ambientes) [NUEVO]

**APIs a agregar:**
- Email SMTP (6 campos)
- Twilio (4 campos)
- Slack (3 campos)
- OpenAI (3 campos) [OPCIONAL]

---

### 8. ⏳ Actualizar api-credentials.routes.ts
**Objetivo:** Usar CredentialsManager en lugar de código duplicado

**Cambios requeridos:**

#### Antes (líneas 20-60):
```typescript
function encryptCredentials(...) { ... }  // ❌ Duplicado
function decryptCredentials(...) { ... }  // ❌ Duplicado

const apiSchemas = { ... };  // ❌ Duplicado
```

#### Después:
```typescript
import { CredentialsManager } from '@/services/credentials-manager.service';

// ✅ Ya no necesita implementar encriptación
// ✅ Ya no necesita schemas Zod
```

#### Rutas a actualizar:

**GET /api/credentials**
```typescript
// Antes:
const creds = await prisma.apiCredential.findMany(...);
const decrypted = creds.map(c => ({
  ...c,
  credentials: decryptCredentials(c.credentials)  // ❌ Manual
}));

// Después:
const apis = await CredentialsManager.listConfiguredApis(req.user.id);  // ✅ Simple
```

**POST /api/credentials**
```typescript
// Antes:
const schema = apiSchemas[apiName];
schema.parse(credentials);  // ❌ Manual
const encrypted = encryptCredentials(credentials);  // ❌ Manual
await prisma.apiCredential.upsert(...);  // ❌ Manual

// Después:
await CredentialsManager.saveCredentials(
  req.user.id,
  apiName,
  credentials,
  environment  // ✅ Nuevo parámetro
);  // ✅ Todo automático
```

**GET /api/credentials/status**
```typescript
// Actualizar para incluir environment en la respuesta
{
  apiName: 'ebay',
  environment: 'sandbox',  // ✅ Nuevo
  configured: true,
  capabilities: { ... }
}
```

---

### 9. ⏳ Refactorizar ebay.service.ts
**Objetivo:** Eliminar `process.env` directo

**Antes (línea 130):**
```typescript
static fromEnv(): EbayService | null {
  const appId = process.env.EBAY_APP_ID;  // ❌ Directo
  const devId = process.env.EBAY_DEV_ID;  // ❌ Directo
  // ...
}
```

**Después:**
```typescript
static async fromDatabase(
  userId: number,
  environment: 'sandbox' | 'production' = 'production'
): Promise<EbayService | null> {
  const creds = await CredentialsManager.getCredentials(
    userId,
    'ebay',
    environment
  );  // ✅ Desde DB
  
  if (!creds) return null;
  
  return new EbayService({
    appId: creds.appId,
    devId: creds.devId,
    certId: creds.certId,
    authToken: creds.authToken,
    sandbox: creds.sandbox,
  });
}
```

---

### 10. ⏳ Refactorizar amazon.service.ts
**Objetivo:** Eliminar `process.env` directo

**Antes (línea 532):**
```typescript
const accessKeyId = this.credentials?.awsAccessKeyId 
  || process.env.AWS_ACCESS_KEY_ID  // ❌ Fallback a env
  || process.env.AMAZON_ACCESS_KEY  // ❌ Múltiples nombres
  || '';
```

**Después:**
```typescript
static async fromDatabase(
  userId: number,
  environment: 'sandbox' | 'production' = 'production'
): Promise<AmazonService | null> {
  const creds = await CredentialsManager.getCredentials(
    userId,
    'amazon',
    environment
  );  // ✅ Único origen
  
  if (!creds) return null;
  
  return new AmazonService({
    sellerId: creds.sellerId,
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    // ... todos los campos
  });
}
```

---

### 11. ⏳ Refactorizar mercadolibre.service.ts
**Objetivo:** Consistencia con otros servicios

**Cambios:**
- Eliminar fallback a `process.env`
- Agregar método `fromDatabase()`
- Usar `CredentialsManager`

---

### 12. ⏳ Migración de Base de Datos
**Objetivo:** Aplicar cambios de schema a PostgreSQL

**Pasos:**
1. ✅ ~~Verificar DATABASE_URL en `.env`~~
2. ⏳ Ejecutar `npx prisma migrate dev --name add_environment_to_api_credentials`
3. ⏳ Verificar que la migración se aplicó correctamente
4. ⏳ (Opcional) Crear script de migración de datos existentes

**Script de migración de datos:**
```sql
-- Si hay datos existentes sin environment, establecer a 'production'
UPDATE api_credentials 
SET environment = 'production' 
WHERE environment IS NULL;
```

---

## 📊 ESTADÍSTICAS

### Archivos Creados: 3
```
✅ backend/src/config/api-keys.config.ts           (285 líneas)
✅ backend/src/types/api-credentials.types.ts      (370 líneas)
✅ backend/src/services/credentials-manager.service.ts  (420 líneas)
```

### Archivos Modificados: 1
```
✅ backend/prisma/schema.prisma  (Agregado campo environment)
```

### Archivos Pendientes: 4
```
⏳ backend/src/routes/settings.routes.ts           (~500 líneas)
⏳ backend/src/api/routes/api-credentials.routes.ts  (~200 líneas a refactorizar)
⏳ backend/src/services/ebay.service.ts            (~50 líneas a cambiar)
⏳ backend/src/services/amazon.service.ts          (~50 líneas a cambiar)
```

### Líneas de Código:
- **Agregadas:** ~1,075 líneas
- **Por modificar:** ~800 líneas
- **Total estimado:** ~1,875 líneas

---

## 🎯 PRÓXIMOS PASOS

### Inmediatos (hoy):
1. ⏳ Actualizar `settings.routes.ts` con estructura de ambientes
2. ⏳ Actualizar `api-credentials.routes.ts` para usar `CredentialsManager`
3. ⏳ Aplicar migración de Prisma en PostgreSQL

### Corto plazo (esta semana):
4. ⏳ Refactorizar `ebay.service.ts`
5. ⏳ Refactorizar `amazon.service.ts`
6. ⏳ Refactorizar `mercadolibre.service.ts`

### Testing:
7. ⏳ Probar flujo completo de guardado de credenciales
8. ⏳ Probar separación sandbox/production
9. ⏳ Verificar encriptación/desencriptación

---

## ✅ BENEFICIOS LOGRADOS

### 1. Nomenclatura Unificada
```
❌ ANTES:
- EBAY_AUTH_TOKEN (settings.routes.ts)
- EBAY_TOKEN (api-credentials.routes.ts)
- EBAY_OAUTH_TOKEN (ebay.service.ts)
- EBAY_USER_TOKEN (demo-server.ts)

✅ AHORA:
- API_KEY_NAMES.EBAY.PRODUCTION.AUTH_TOKEN (único lugar)
```

### 2. Type Safety Completo
```typescript
// ✅ AHORA TypeScript sabe exactamente qué campos tiene cada API
const creds = await CredentialsManager.getCredentials(1, 'ebay', 'sandbox');
console.log(creds.appId);     // ✅ OK - TypeScript sabe que existe
console.log(creds.clientId);  // ❌ Error - TypeScript sabe que NO existe
```

### 3. Validación Automática
```typescript
// ✅ AHORA Zod valida automáticamente antes de guardar
await CredentialsManager.saveCredentials(1, 'ebay', {
  appId: '',  // ❌ Error: App ID is required
  devId: 'DEV123',
  certId: 'CERT456',
  sandbox: true,
});
```

### 4. Sandbox/Production Separados
```typescript
// ✅ AHORA puedes tener ambos configurados
await CredentialsManager.saveCredentials(1, 'ebay', sandboxCreds, 'sandbox');
await CredentialsManager.saveCredentials(1, 'ebay', prodCreds, 'production');

// Y cambiar entre ellos fácilmente
const creds = await CredentialsManager.getCredentials(1, 'ebay', currentEnv);
```

### 5. Código Más Limpio
```typescript
// ❌ ANTES (settings.routes.ts, 60 líneas):
function encrypt(text: string) { ... }
function decrypt(encrypted: { encrypted: string, iv: string, tag: string }) { ... }
const iv = crypto.randomBytes(16);
const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
// ...muchas más líneas

// ✅ AHORA (en cualquier archivo, 1 línea):
await CredentialsManager.saveCredentials(userId, 'ebay', credentials);
```

---

## 🚨 NOTAS IMPORTANTES

### ⚠️ Breaking Changes
Los siguientes cambios son breaking y requieren migración:

1. **Schema de DB:**
   - Constraint único cambió de `[userId, apiName]` a `[userId, apiName, environment]`
   - Registros existentes necesitan tener `environment='production'`

2. **API de Credenciales:**
   - `POST /api/credentials` ahora requiere campo `environment`
   - `GET /api/credentials/:apiName` debe especificar `?environment=sandbox|production`

3. **Servicios:**
   - `EbayService.fromEnv()` → `EbayService.fromDatabase(userId, environment)`
   - Todos los servicios deben migrar a usar `CredentialsManager`

### ✅ Retrocompatibilidad
Para mantener código viejo funcionando temporalmente:

1. **Legacy Keys:**
   - `API_KEY_NAMES.EBAY.LEGACY` contiene nombres antiguos
   - Permite buscar en ambos formatos durante migración

2. **Default Environment:**
   - Si no se especifica environment, usa `'production'` por defecto
   - APIs sin ambientes (GROQ, ScraperAPI) siempre usan `'production'`

3. **Método con Fallback:**
   - `CredentialsManager.getCredentialsWithFallback()` (deprecated)
   - Busca en DB primero, luego en `process.env` como fallback
   - ⚠️ Deshabilitado por defecto, solo para emergencias

---

## 📚 DOCUMENTACIÓN RELACIONADA

- **Auditoría Completa:** `AUDITORIA_SISTEMA_APIS.md`
- **Listado de APIs:** `LISTADO_COMPLETO_APIS.md`
- **Configuración:** `CONFIGURACION_APIS_COMPLETA.md`
- **Resumen:** `RESUMEN_APIS_COMPLETO.md`

---

**Última actualización:** 4 de noviembre de 2025 - 23:45  
**Progreso total:** 50% (6/12 tareas completadas)  
**Tiempo invertido:** ~2 horas  
**Tiempo estimado restante:** ~4 horas
