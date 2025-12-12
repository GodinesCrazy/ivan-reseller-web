# 🔍 AUDITORÍA COMPLETA: Stripe API

**Fecha**: 2025-12-11  
**Objetivo**: Auditar la consistencia y el correcto flujo de configuración y lógica de la API de Stripe, especialmente en la validación de credenciales y el manejo de ambientes (sandbox/production).

---

## 📋 RESUMEN DE HALLAZGOS Y CORRECCIONES

### 1. Problema Identificado

**Stripe API no tenía método `checkStripeAPI`**:
- La API estaba definida en los schemas de Zod (`backend/src/services/credentials-manager.service.ts`)
- Estaba configurada en el frontend (`frontend/src/pages/APISettings.tsx`)
- Tenía definición en `api-keys.config.ts`
- **PERO** no tenía un método de validación en `api-availability.service.ts`
- Esto causaba que el estado de Stripe no se mostrara correctamente en el frontend

### 2. Correcciones Aplicadas

#### 2.1 Backend (`backend/src/services/api-availability.service.ts`)

**Implementado `checkStripeAPI`**:
- ✅ Validación de campos requeridos: `publicKey` y `secretKey`
- ✅ Validación de formato de keys:
  - Public Key: debe empezar con `pk_test_` (sandbox) o `pk_live_` (production)
  - Secret Key: debe empezar con `sk_test_` (sandbox) o `sk_live_` (production)
- ✅ Validación de consistencia de sandbox flag con environment
- ✅ Soporte para múltiples variantes de nombres de campos (camelCase y UPPER_CASE)
- ✅ Manejo de errores robusto
- ✅ Caché para optimizar rendimiento

**Código implementado**:
```typescript
async checkStripeAPI(userId: number, environment: 'sandbox' | 'production' = 'production', forceRefresh: boolean = false): Promise<APIStatus> {
  // Validación de credenciales
  const publicKey = credentials['publicKey'] || credentials['STRIPE_PUBLIC_KEY'] || 
                    credentials['STRIPE_PUBLISHABLE_KEY'] || 
                    (environment === 'sandbox' ? credentials['STRIPE_SANDBOX_PUBLIC_KEY'] : credentials['STRIPE_PRODUCTION_PUBLIC_KEY']);
  const secretKey = credentials['secretKey'] || credentials['STRIPE_SECRET_KEY'] || 
                    (environment === 'sandbox' ? credentials['STRIPE_SANDBOX_SECRET_KEY'] : credentials['STRIPE_PRODUCTION_SECRET_KEY']);
  
  // Validación de formato
  const isTestKey = publicKeyStr.startsWith('pk_test_');
  const isLiveKey = publicKeyStr.startsWith('pk_live_');
  // ... validación similar para secretKey
}
```

**Integrado en `getAllAPIStatus`**:
- ✅ Agregado a `criticalChecks` (ejecuta en serie para evitar SIGSEGV)
- ✅ Agregado al array de retorno de statuses
- ✅ Soporte para sandbox environment (similar a PayPal)

#### 2.2 Backend (`backend/src/services/credentials-manager.service.ts`)

**Normalización de credenciales de Stripe**:
- ✅ Conversión de UPPER_CASE a camelCase:
  - `STRIPE_PUBLIC_KEY` / `STRIPE_PUBLISHABLE_KEY` → `publicKey`
  - `STRIPE_SECRET_KEY` → `secretKey`
  - `STRIPE_WEBHOOK_SECRET` → `webhookSecret`
- ✅ Soporte para keys específicas de ambiente:
  - `STRIPE_SANDBOX_PUBLIC_KEY` → `publicKey` (si environment === 'sandbox')
  - `STRIPE_PRODUCTION_PUBLIC_KEY` → `publicKey` (si environment === 'production')
- ✅ Normalización de sandbox flag basado en environment
- ✅ Trim de keys para eliminar espacios en blanco

**Código implementado**:
```typescript
// ✅ Stripe API normalization
if (apiName === 'stripe') {
  // Normalize field names from UPPER_CASE to camelCase
  if (creds.STRIPE_PUBLIC_KEY && !creds.publicKey) creds.publicKey = creds.STRIPE_PUBLIC_KEY;
  if (creds.STRIPE_PUBLISHABLE_KEY && !creds.publicKey) creds.publicKey = creds.STRIPE_PUBLISHABLE_KEY;
  // ... más normalizaciones
  
  // Normalize sandbox flag based on environment
  if (typeof creds.sandbox === 'undefined') {
    creds.sandbox = environment === 'sandbox';
  }
  
  // Trim keys
  if (creds.publicKey && typeof creds.publicKey === 'string') {
    creds.publicKey = creds.publicKey.trim();
  }
  // ... más trims
}
```

#### 2.3 Backend (`backend/src/api/routes/api-credentials.routes.ts`)

**Agregado caso de Stripe en endpoint `/api/credentials/status`**:
- ✅ Agregado `case 'stripe':` en el switch statement
- ✅ Llama a `apiAvailability.checkStripeAPI(userId)`

#### 2.4 Frontend (`frontend/src/pages/APISettings.tsx`)

**Agregado mapeo de campos de Stripe**:
- ✅ Mapeo de `STRIPE_PUBLIC_KEY` → `publicKey`
- ✅ Mapeo de `STRIPE_PUBLISHABLE_KEY` → `publicKey`
- ✅ Mapeo de `STRIPE_SECRET_KEY` → `secretKey`
- ✅ Mapeo de `STRIPE_WEBHOOK_SECRET` → `webhookSecret`
- ✅ Mapeo de keys específicas de ambiente (sandbox/production)

---

## ✅ RESULTADO FINAL

### Antes
- ❌ Stripe no tenía método de validación
- ❌ El estado de Stripe no se mostraba en el frontend
- ❌ No había validación de formato de keys
- ❌ No había normalización de campos

### Después
- ✅ Stripe tiene método `checkStripeAPI` completo
- ✅ El estado de Stripe se muestra correctamente en el frontend
- ✅ Validación de formato de keys (pk_test_/pk_live_, sk_test_/sk_live_)
- ✅ Normalización completa de campos (camelCase + UPPER_CASE)
- ✅ Soporte para sandbox y production environments
- ✅ Validación de consistencia de sandbox flag

---

## 📝 CONFIGURACIÓN

### Campos Requeridos

**Sandbox (Test Mode)**:
- `publicKey`: `pk_test_...` (Publishable Key de test)
- `secretKey`: `sk_test_...` (Secret Key de test)
- `webhookSecret`: `whsec_...` (opcional, para webhooks)

**Production (Live Mode)**:
- `publicKey`: `pk_live_...` (Publishable Key de producción)
- `secretKey`: `sk_live_...` (Secret Key de producción)
- `webhookSecret`: `whsec_...` (opcional, para webhooks)

### Validaciones Implementadas

1. **Formato de Public Key**:
   - Sandbox: debe empezar con `pk_test_`
   - Production: debe empezar con `pk_live_`

2. **Formato de Secret Key**:
   - Sandbox: debe empezar con `sk_test_`
   - Production: debe empezar con `sk_live_`

3. **Consistencia de Sandbox Flag**:
   - El flag `sandbox` en las credenciales debe coincidir con el `environment` solicitado

---

## 🔄 COMPATIBILIDAD

### Nombres de Campos Soportados

El sistema acepta múltiples variantes de nombres de campos para máxima compatibilidad:

**Public Key**:
- `publicKey` (camelCase, preferido)
- `STRIPE_PUBLIC_KEY` (UPPER_CASE, legacy)
- `STRIPE_PUBLISHABLE_KEY` (UPPER_CASE, alternativo)
- `STRIPE_SANDBOX_PUBLIC_KEY` (ambiente específico)
- `STRIPE_PRODUCTION_PUBLIC_KEY` (ambiente específico)

**Secret Key**:
- `secretKey` (camelCase, preferido)
- `STRIPE_SECRET_KEY` (UPPER_CASE, legacy)
- `STRIPE_SANDBOX_SECRET_KEY` (ambiente específico)
- `STRIPE_PRODUCTION_SECRET_KEY` (ambiente específico)

**Webhook Secret**:
- `webhookSecret` (camelCase, preferido)
- `STRIPE_WEBHOOK_SECRET` (UPPER_CASE, legacy)
- `STRIPE_SANDBOX_WEBHOOK_SECRET` (ambiente específico)
- `STRIPE_PRODUCTION_WEBHOOK_SECRET` (ambiente específico)

---

## 🧪 PRUEBAS RECOMENDADAS

1. **Configurar Stripe Sandbox**:
   - Ingresar `pk_test_...` y `sk_test_...`
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que `sandbox: true` se guarde correctamente

2. **Configurar Stripe Production**:
   - Ingresar `pk_live_...` y `sk_live_...`
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que `sandbox: false` se guarde correctamente

3. **Validación de Formato**:
   - Intentar guardar `pk_invalid_...` y verificar que se muestre error
   - Intentar guardar `sk_invalid_...` y verificar que se muestre error

4. **Normalización de Campos**:
   - Guardar credenciales con `STRIPE_PUBLIC_KEY` y verificar que se normalice a `publicKey`
   - Verificar que el sistema acepte múltiples variantes de nombres

---

**Última actualización**: 2025-12-11

