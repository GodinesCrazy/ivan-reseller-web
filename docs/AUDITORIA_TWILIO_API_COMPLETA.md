# 🔍 AUDITORÍA COMPLETA: Twilio API

**Fecha**: 2025-12-11  
**Objetivo**: Auditar la consistencia y el correcto flujo de configuración y lógica de la API de Twilio (SMS/WhatsApp), especialmente en la validación de credenciales y el manejo de variables de entorno vs. CredentialsManager.

---

## 📋 RESUMEN DE HALLAZGOS Y CORRECCIONES

### 1. Problema Identificado

**Twilio API no tenía método `checkTwilioAPI`**:
- La API estaba definida en los schemas de Zod (`backend/src/services/credentials-manager.service.ts`)
- El servicio `notifications.service.ts` leía directamente de variables de entorno (`process.env`)
- **PERO** no tenía un método de validación en `api-availability.service.ts`
- No había normalización de campos (soporte para múltiples variantes)
- Esto causaba que el estado de Twilio no se mostrara correctamente en el frontend

### 2. Correcciones Aplicadas

#### 2.1 Backend (`backend/src/services/api-availability.service.ts`)

**Implementado `checkTwilioAPI`**:
- ✅ Validación de campos requeridos: `accountSid`, `authToken`, `phoneNumber`
- ✅ Validación de formato de Account SID (debe empezar con 'AC' y tener 32-34 caracteres)
- ✅ Validación de formato de número de teléfono (debe empezar con '+' o 'whatsapp:+')
- ✅ Soporte dual: primero intenta obtener credenciales de CredentialsManager, luego verifica variables de entorno
- ✅ Soporte para múltiples variantes de nombres de campos (camelCase y UPPER_CASE)
- ✅ Manejo de errores robusto
- ✅ Caché para optimizar rendimiento

**Código implementado**:
```typescript
async checkTwilioAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
  // Intentar obtener credenciales de CredentialsManager
  let credentials = await this.getUserCredentials(userId, 'twilio', 'production').catch(() => null);
  
  // Si no hay credenciales en la BD, verificar variables de entorno
  if (!credentials) {
    const hasEnvAccountSid = !!(process.env.TWILIO_ACCOUNT_SID);
    // ... verificar otras variables de entorno
    if (hasEnvAccountSid && hasEnvAuthToken && hasEnvPhoneNumber) {
      credentials = {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER || '',
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER,
      };
    }
  }
  
  // Validaciones de formato
  if (!accountSidStr.startsWith('AC')) {
    accountSidValid = false;
    accountSidError = 'Account SID debe empezar con "AC"';
  }
  // ... más validaciones
}
```

**Integrado en `getAllAPIStatus`**:
- ✅ Agregado a `simpleChecks` (ejecuta en paralelo con otras APIs simples)
- ✅ Agregado al array de retorno de statuses

#### 2.2 Backend (`backend/src/services/credentials-manager.service.ts`)

**Normalización de credenciales de Twilio**:
- ✅ Conversión de UPPER_CASE a camelCase:
  - `TWILIO_ACCOUNT_SID` → `accountSid`
  - `TWILIO_AUTH_TOKEN` → `authToken`
  - `TWILIO_PHONE_NUMBER` / `TWILIO_FROM_NUMBER` → `phoneNumber`
  - `TWILIO_WHATSAPP_NUMBER` → `whatsappNumber`
- ✅ Trim de todos los campos string

**Código implementado**:
```typescript
// ✅ Twilio API normalization
if (apiName === 'twilio') {
  // Normalize field names from UPPER_CASE to camelCase
  if (creds.TWILIO_ACCOUNT_SID && !creds.accountSid) creds.accountSid = creds.TWILIO_ACCOUNT_SID;
  if (creds.TWILIO_AUTH_TOKEN && !creds.authToken) creds.authToken = creds.TWILIO_AUTH_TOKEN;
  if (creds.TWILIO_PHONE_NUMBER && !creds.phoneNumber) creds.phoneNumber = creds.TWILIO_PHONE_NUMBER;
  if (creds.TWILIO_FROM_NUMBER && !creds.phoneNumber) creds.phoneNumber = creds.TWILIO_FROM_NUMBER;
  if (creds.TWILIO_WHATSAPP_NUMBER && !creds.whatsappNumber) creds.whatsappNumber = creds.TWILIO_WHATSAPP_NUMBER;
  
  // Trim string fields
  if (creds.accountSid && typeof creds.accountSid === 'string') {
    creds.accountSid = creds.accountSid.trim();
  }
  // ... más trims
}
```

#### 2.3 Backend (`backend/src/api/routes/api-credentials.routes.ts`)

**Agregado caso de Twilio en endpoint `/api/credentials/status`**:
- ✅ Agregado `case 'twilio':` en el switch statement
- ✅ Llama a `apiAvailability.checkTwilioAPI(userId)`

#### 2.4 Frontend (`frontend/src/pages/APISettings.tsx`)

**Agregado mapeo de campos de Twilio**:
- ✅ Mapeo de `TWILIO_ACCOUNT_SID` → `accountSid`
- ✅ Mapeo de `TWILIO_AUTH_TOKEN` → `authToken`
- ✅ Mapeo de `TWILIO_PHONE_NUMBER` / `TWILIO_FROM_NUMBER` → `phoneNumber`
- ✅ Mapeo de `TWILIO_WHATSAPP_NUMBER` → `whatsappNumber`

---

## ✅ RESULTADO FINAL

### Antes
- ❌ Twilio no tenía método de validación
- ❌ El estado de Twilio no se mostraba en el frontend
- ❌ No había validación de formato de Account SID o número de teléfono
- ❌ No había normalización de campos
- ❌ Solo leía de variables de entorno, no de CredentialsManager

### Después
- ✅ Twilio tiene método `checkTwilioAPI` completo
- ✅ El estado de Twilio se muestra correctamente en el frontend
- ✅ Validación de formato de Account SID (AC...) y número de teléfono (+...)
- ✅ Normalización completa de campos (camelCase + UPPER_CASE)
- ✅ Soporte dual: CredentialsManager + variables de entorno
- ✅ Compatibilidad hacia atrás mantenida (funciona con variables de entorno)

---

## 📝 CONFIGURACIÓN

### Campos Requeridos

- `accountSid`: Account SID de Twilio (ej: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
- `authToken`: Auth Token de Twilio
- `phoneNumber`: Número de teléfono de Twilio con código de país (ej: `+1234567890`)
- `whatsappNumber`: Número de WhatsApp Business (opcional, ej: `whatsapp:+1234567890`)

### Validaciones Implementadas

1. **Formato de Account SID**:
   - Debe empezar con `AC`
   - Debe tener entre 32 y 34 caracteres de longitud
   - Ejemplo válido: `AC...` (32-34 caracteres, empezando con AC)

2. **Formato de Número de Teléfono**:
   - Debe empezar con `+` o `whatsapp:+`
   - Ejemplos válidos: `+1234567890`, `whatsapp:+1234567890`

3. **Campos Requeridos**:
   - `accountSid`, `authToken`, `phoneNumber` son obligatorios
   - `whatsappNumber` es opcional

---

## 🔄 COMPATIBILIDAD

### Orden de Búsqueda de Credenciales

1. **CredentialsManager** (Base de datos):
   - Busca credenciales guardadas para el usuario
   - Prioridad si existen

2. **Variables de Entorno** (Fallback):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER` o `TWILIO_FROM_NUMBER`
   - `TWILIO_WHATSAPP_NUMBER` (opcional)

### Nombres de Campos Soportados

El sistema acepta múltiples variantes de nombres de campos para máxima compatibilidad:

**Account SID**:
- `accountSid` (camelCase, preferido)
- `TWILIO_ACCOUNT_SID` (UPPER_CASE, legacy)

**Auth Token**:
- `authToken` (camelCase, preferido)
- `TWILIO_AUTH_TOKEN` (UPPER_CASE, legacy)

**Phone Number**:
- `phoneNumber` (camelCase, preferido)
- `TWILIO_PHONE_NUMBER` (UPPER_CASE, legacy)
- `TWILIO_FROM_NUMBER` (UPPER_CASE, alternativo)

**WhatsApp Number**:
- `whatsappNumber` (camelCase, preferido)
- `TWILIO_WHATSAPP_NUMBER` (UPPER_CASE, legacy)

---

## 💰 COSTOS

- **SMS**: ~$0.0075 por mensaje
- **WhatsApp**: ~$0.005 por mensaje
- **Voz**: ~$0.013 por minuto (si se usa)

---

## 🧪 PRUEBAS RECOMENDADAS

1. **Configurar Twilio desde CredentialsManager**:
   - Guardar credenciales en Settings → API Settings → Twilio
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas credenciales

2. **Configurar Twilio desde Variables de Entorno**:
   - Configurar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, etc. en `.env`
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas variables

3. **Validación de Formato**:
   - Intentar guardar Account SID inválido (ej: sin 'AC') y verificar error
   - Intentar guardar número de teléfono inválido (ej: sin '+') y verificar error

4. **Normalización de Campos**:
   - Guardar credenciales con `TWILIO_ACCOUNT_SID` y verificar que se normalice a `accountSid`
   - Guardar credenciales con `TWILIO_FROM_NUMBER` y verificar que se mapee a `phoneNumber`

---

**Última actualización**: 2025-12-11

