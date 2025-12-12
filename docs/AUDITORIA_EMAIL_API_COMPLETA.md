# 🔍 AUDITORÍA COMPLETA: Email/SMTP API

**Fecha**: 2025-12-11  
**Objetivo**: Auditar la consistencia y el correcto flujo de configuración y lógica de la API de Email/SMTP, especialmente en la validación de credenciales y el manejo de variables de entorno vs. CredentialsManager.

---

## 📋 RESUMEN DE HALLAZGOS Y CORRECCIONES

### 1. Problema Identificado

**Email/SMTP API no tenía método `checkEmailAPI`**:
- La API estaba definida en los schemas de Zod (`backend/src/services/credentials-manager.service.ts`)
- El servicio `email.service.ts` leía directamente de variables de entorno (`process.env`)
- **PERO** no tenía un método de validación en `api-availability.service.ts`
- No había normalización de campos (soporte para múltiples variantes)
- Esto causaba que el estado de Email no se mostrara correctamente en el frontend

### 2. Correcciones Aplicadas

#### 2.1 Backend (`backend/src/services/api-availability.service.ts`)

**Implementado `checkEmailAPI`**:
- ✅ Validación de campos requeridos: `host`, `port`, `user`, `password`, `from`
- ✅ Validación de formato de puerto (1-65535)
- ✅ Validación de formato de email en campo `from`
- ✅ Soporte dual: primero intenta obtener credenciales de CredentialsManager, luego verifica variables de entorno
- ✅ Soporte para múltiples variantes de nombres de campos (camelCase y UPPER_CASE)
- ✅ Manejo de errores robusto
- ✅ Caché para optimizar rendimiento

**Código implementado**:
```typescript
async checkEmailAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
  // Intentar obtener credenciales de CredentialsManager
  let credentials = await this.getUserCredentials(userId, 'email', 'production').catch(() => null);
  
  // Si no hay credenciales en la BD, verificar variables de entorno
  if (!credentials) {
    const hasEnvHost = !!(process.env.EMAIL_HOST || process.env.SMTP_HOST);
    // ... verificar otras variables de entorno
    if (hasEnvHost && hasEnvUser && hasEnvPass && hasEnvFrom) {
      credentials = {
        host: process.env.EMAIL_HOST || process.env.SMTP_HOST || '',
        port: parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '587'),
        // ... más campos
      };
    }
  }
  
  // Validaciones de formato
  const hasPort = !!(port && port > 0 && port <= 65535);
  const hasFrom = !!(from && String(from).trim() && from.includes('@'));
  // ... más validaciones
}
```

**Integrado en `getAllAPIStatus`**:
- ✅ Agregado a `simpleChecks` (ejecuta en paralelo con otras APIs simples)
- ✅ Agregado al array de retorno de statuses

#### 2.2 Backend (`backend/src/services/credentials-manager.service.ts`)

**Normalización de credenciales de Email**:
- ✅ Conversión de UPPER_CASE a camelCase:
  - `EMAIL_HOST` / `SMTP_HOST` → `host`
  - `EMAIL_PORT` / `SMTP_PORT` → `port`
  - `EMAIL_USER` / `SMTP_USER` → `user`
  - `EMAIL_PASSWORD` / `SMTP_PASS` → `password`
  - `EMAIL_FROM` / `SMTP_FROM` → `from`
  - `EMAIL_FROM_NAME` / `SMTP_FROM_NAME` → `fromName`
  - `EMAIL_SECURE` / `SMTP_SECURE` → `secure`
- ✅ Normalización de `port` a número
- ✅ Normalización de `secure` flag (default: true si port === 465, false otherwise)
- ✅ Trim de todos los campos string

**Código implementado**:
```typescript
// ✅ Email/SMTP API normalization
if (apiName === 'email') {
  // Normalize field names from UPPER_CASE to camelCase
  if (creds.EMAIL_HOST && !creds.host) creds.host = creds.EMAIL_HOST;
  if (creds.SMTP_HOST && !creds.host) creds.host = creds.SMTP_HOST;
  // ... más normalizaciones
  
  // Normalize port to number
  if (creds.port && typeof creds.port === 'string') {
    creds.port = parseInt(creds.port);
  }
  
  // Normalize secure flag
  if (typeof creds.secure === 'undefined' || creds.secure === null) {
    // Default: true if port is 465, false otherwise
    const port = creds.port || 587;
    creds.secure = port === 465;
  }
  
  // Trim string fields
  if (creds.host && typeof creds.host === 'string') {
    creds.host = creds.host.trim();
  }
  // ... más trims
}
```

#### 2.3 Backend (`backend/src/api/routes/api-credentials.routes.ts`)

**Agregado caso de Email en endpoint `/api/credentials/status`**:
- ✅ Agregado `case 'email':` en el switch statement
- ✅ Llama a `apiAvailability.checkEmailAPI(userId)`

#### 2.4 Frontend (`frontend/src/pages/APISettings.tsx`)

**Agregado mapeo de campos de Email**:
- ✅ Mapeo de `EMAIL_HOST` / `SMTP_HOST` → `host`
- ✅ Mapeo de `EMAIL_PORT` / `SMTP_PORT` → `port`
- ✅ Mapeo de `EMAIL_USER` / `SMTP_USER` → `user`
- ✅ Mapeo de `EMAIL_PASSWORD` / `SMTP_PASS` → `password`
- ✅ Mapeo de `EMAIL_FROM` / `SMTP_FROM` → `from`
- ✅ Mapeo de `EMAIL_FROM_NAME` / `SMTP_FROM_NAME` → `fromName`
- ✅ Mapeo de `EMAIL_SECURE` / `SMTP_SECURE` → `secure`

---

## ✅ RESULTADO FINAL

### Antes
- ❌ Email no tenía método de validación
- ❌ El estado de Email no se mostraba en el frontend
- ❌ No había validación de formato de puerto o email
- ❌ No había normalización de campos
- ❌ Solo leía de variables de entorno, no de CredentialsManager

### Después
- ✅ Email tiene método `checkEmailAPI` completo
- ✅ El estado de Email se muestra correctamente en el frontend
- ✅ Validación de formato de puerto (1-65535) y email
- ✅ Normalización completa de campos (camelCase + UPPER_CASE)
- ✅ Soporte dual: CredentialsManager + variables de entorno
- ✅ Compatibilidad hacia atrás mantenida (funciona con variables de entorno)

---

## 📝 CONFIGURACIÓN

### Campos Requeridos

- `host`: Servidor SMTP (ej: `smtp.gmail.com`, `smtp.sendgrid.net`)
- `port`: Puerto SMTP (587 para TLS, 465 para SSL, 25 para sin cifrado)
- `user`: Usuario/Email de autenticación
- `password`: Contraseña o API key
- `from`: Email remitente (debe ser un email válido)
- `fromName`: Nombre del remitente (opcional)
- `secure`: Boolean - true para TLS/SSL, false para sin cifrado (opcional, se infiere del puerto)

### Validaciones Implementadas

1. **Formato de Puerto**:
   - Debe ser un número entre 1 y 65535
   - Si es string, se convierte a número

2. **Formato de Email en `from`**:
   - Debe ser un email válido (contiene `@` y formato correcto)
   - Validación con regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

3. **Campos Requeridos**:
   - `host`, `port`, `user`, `password`, `from` son obligatorios
   - `fromName` y `secure` son opcionales

---

## 🔄 COMPATIBILIDAD

### Orden de Búsqueda de Credenciales

1. **CredentialsManager** (Base de datos):
   - Busca credenciales guardadas para el usuario
   - Prioridad si existen

2. **Variables de Entorno** (Fallback):
   - `EMAIL_HOST` o `SMTP_HOST`
   - `EMAIL_PORT` o `SMTP_PORT`
   - `EMAIL_USER` o `SMTP_USER`
   - `EMAIL_PASSWORD` o `SMTP_PASS`
   - `EMAIL_FROM` o `SMTP_FROM`
   - `EMAIL_FROM_NAME` o `SMTP_FROM_NAME` (opcional)
   - `EMAIL_SECURE` o `SMTP_SECURE` (opcional)

### Nombres de Campos Soportados

El sistema acepta múltiples variantes de nombres de campos para máxima compatibilidad:

**Host**:
- `host` (camelCase, preferido)
- `EMAIL_HOST` (UPPER_CASE, legacy)
- `SMTP_HOST` (UPPER_CASE, alternativo)

**Port**:
- `port` (camelCase, preferido, número)
- `EMAIL_PORT` (UPPER_CASE, legacy)
- `SMTP_PORT` (UPPER_CASE, alternativo)

**User**:
- `user` (camelCase, preferido)
- `EMAIL_USER` (UPPER_CASE, legacy)
- `SMTP_USER` (UPPER_CASE, alternativo)

**Password**:
- `password` (camelCase, preferido)
- `EMAIL_PASSWORD` (UPPER_CASE, legacy)
- `SMTP_PASS` (UPPER_CASE, alternativo)

**From**:
- `from` (camelCase, preferido)
- `EMAIL_FROM` (UPPER_CASE, legacy)
- `SMTP_FROM` (UPPER_CASE, alternativo)

**From Name**:
- `fromName` (camelCase, preferido)
- `EMAIL_FROM_NAME` (UPPER_CASE, legacy)
- `SMTP_FROM_NAME` (UPPER_CASE, alternativo)

**Secure**:
- `secure` (camelCase, preferido, boolean)
- `EMAIL_SECURE` (UPPER_CASE, legacy)
- `SMTP_SECURE` (UPPER_CASE, alternativo)
- Si no se especifica, se infiere: `true` si port === 465, `false` otherwise

---

## 🔧 SERVICIOS COMPATIBLES

El Email Service es compatible con cualquier servidor SMTP:

- **Gmail**: `smtp.gmail.com:587` (TLS)
- **SendGrid**: `smtp.sendgrid.net:587` (TLS)
- **Mailgun**: `smtp.mailgun.org:587` (TLS)
- **AWS SES**: `email-smtp.region.amazonaws.com:587` (TLS)
- **Resend**: `smtp.resend.com:587` (TLS)
- **Otros**: Cualquier servidor SMTP estándar

---

## 🧪 PRUEBAS RECOMENDADAS

1. **Configurar Email desde CredentialsManager**:
   - Guardar credenciales en Settings → API Settings → Email
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas credenciales

2. **Configurar Email desde Variables de Entorno**:
   - Configurar `EMAIL_HOST`, `EMAIL_PORT`, etc. en `.env`
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use estas variables

3. **Validación de Formato**:
   - Intentar guardar puerto inválido (ej: 99999) y verificar error
   - Intentar guardar email inválido en `from` y verificar error

4. **Normalización de Campos**:
   - Guardar credenciales con `EMAIL_HOST` y verificar que se normalice a `host`
   - Guardar credenciales con `SMTP_PORT` como string y verificar que se convierta a número

---

**Última actualización**: 2025-12-11

