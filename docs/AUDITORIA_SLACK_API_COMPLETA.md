# 🔍 AUDITORÍA COMPLETA: Slack API

**Fecha**: 2025-12-11  
**Objetivo**: Auditar la consistencia y el correcto flujo de configuración y lógica de la API de Slack, especialmente en la validación de credenciales y el manejo de variables de entorno vs. CredentialsManager.

---

## 📋 RESUMEN DE HALLAZGOS Y CORRECCIONES

### 1. Problema Identificado

**Slack API no tenía método `checkSlackAPI`**:
- La API estaba definida en los schemas de Zod (`backend/src/services/credentials-manager.service.ts`)
- El servicio `notifications.service.ts` leía directamente de variables de entorno (`process.env`)
- **PERO** no tenía un método de validación en `api-availability.service.ts`
- No había normalización de campos (soporte para múltiples variantes)
- Esto causaba que el estado de Slack no se mostrara correctamente en el frontend

### 2. Correcciones Aplicadas

#### 2.1 Backend (`backend/src/services/api-availability.service.ts`)

**Implementado `checkSlackAPI`**:
- ✅ Validación especial: requiere AL MENOS uno de `webhookUrl` o `botToken`
- ✅ Validación de formato de Webhook URL (debe ser URL válida de Slack: `https://hooks.slack.com/...`)
- ✅ Validación de formato de Bot Token (debe empezar con `xoxb-` o `xoxp-`)
- ✅ Soporte dual: primero intenta obtener credenciales de CredentialsManager, luego verifica variables de entorno
- ✅ Soporte para múltiples variantes de nombres de campos (camelCase y UPPER_CASE)
- ✅ Manejo de errores robusto
- ✅ Caché para optimizar rendimiento

**Código implementado**:
```typescript
async checkSlackAPI(userId: number, forceRefresh: boolean = false): Promise<APIStatus> {
  // Intentar obtener credenciales de CredentialsManager
  let credentials = await this.getUserCredentials(userId, 'slack', 'production').catch(() => null);
  
  // Si no hay credenciales en la BD, verificar variables de entorno
  if (!credentials) {
    const hasEnvWebhookUrl = !!(process.env.SLACK_WEBHOOK_URL);
    const hasEnvBotToken = !!(process.env.SLACK_BOT_TOKEN);
    
    if (hasEnvWebhookUrl || hasEnvBotToken) {
      credentials = {
        webhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
        botToken: process.env.SLACK_BOT_TOKEN || undefined,
        channel: process.env.SLACK_CHANNEL || '#ivan-reseller',
      };
    }
  }
  
  // Validación especial: requiere AL MENOS uno de webhookUrl o botToken
  const validation = {
    valid: hasWebhookUrl || hasBotToken,
    missing: (!hasWebhookUrl && !hasBotToken) ? ['webhookUrl o botToken (al menos uno es requerido)'] : []
  };
  
  // Validar formato de Webhook URL
  if (hasWebhookUrl) {
    const url = new URL(webhookUrlStr);
    if (!url.href.startsWith('https://hooks.slack.com/')) {
      webhookUrlValid = false;
      webhookUrlError = 'Webhook URL debe ser una URL de Slack válida';
    }
  }
  
  // Validar formato de Bot Token
  if (hasBotToken) {
    if (!botTokenStr.startsWith('xoxb-') && !botTokenStr.startsWith('xoxp-')) {
      botTokenValid = false;
      botTokenError = 'Bot Token debe empezar con "xoxb-" (bot) o "xoxp-" (user)';
    }
  }
}
```

**Integrado en `getAllAPIStatus`**:
- ✅ Agregado a `simpleChecks` (ejecuta en paralelo con otras APIs simples)
- ✅ Agregado al array de retorno de statuses

#### 2.2 Backend (`backend/src/services/credentials-manager.service.ts`)

**Normalización de credenciales de Slack**:
- ✅ Conversión de UPPER_CASE a camelCase:
  - `SLACK_WEBHOOK_URL` → `webhookUrl`
  - `SLACK_BOT_TOKEN` → `botToken`
  - `SLACK_CHANNEL` → `channel`
- ✅ Trim de todos los campos string

**Código implementado**:
```typescript
// ✅ Slack API normalization
if (apiName === 'slack') {
  // Normalize field names from UPPER_CASE to camelCase
  if (creds.SLACK_WEBHOOK_URL && !creds.webhookUrl) creds.webhookUrl = creds.SLACK_WEBHOOK_URL;
  if (creds.SLACK_BOT_TOKEN && !creds.botToken) creds.botToken = creds.SLACK_BOT_TOKEN;
  if (creds.SLACK_CHANNEL && !creds.channel) creds.channel = creds.SLACK_CHANNEL;
  
  // Trim string fields
  if (creds.webhookUrl && typeof creds.webhookUrl === 'string') {
    creds.webhookUrl = creds.webhookUrl.trim();
  }
  // ... más trims
}
```

#### 2.3 Backend (`backend/src/api/routes/api-credentials.routes.ts`)

**Agregado caso de Slack en endpoint `/api/credentials/status`**:
- ✅ Agregado `case 'slack':` en el switch statement
- ✅ Llama a `apiAvailability.checkSlackAPI(userId)`

#### 2.4 Frontend (`frontend/src/pages/APISettings.tsx`)

**Agregado mapeo de campos de Slack**:
- ✅ Mapeo de `SLACK_WEBHOOK_URL` → `webhookUrl`
- ✅ Mapeo de `SLACK_BOT_TOKEN` → `botToken`
- ✅ Mapeo de `SLACK_CHANNEL` → `channel`

---

## ✅ RESULTADO FINAL

### Antes
- ❌ Slack no tenía método de validación
- ❌ El estado de Slack no se mostraba en el frontend
- ❌ No había validación de formato de Webhook URL o Bot Token
- ❌ No había normalización de campos
- ❌ Solo leía de variables de entorno, no de CredentialsManager

### Después
- ✅ Slack tiene método `checkSlackAPI` completo
- ✅ El estado de Slack se muestra correctamente en el frontend
- ✅ Validación de formato de Webhook URL (https://hooks.slack.com/...) y Bot Token (xoxb-/xoxp-)
- ✅ Validación especial: requiere AL MENOS uno de webhookUrl o botToken
- ✅ Normalización completa de campos (camelCase + UPPER_CASE)
- ✅ Soporte dual: CredentialsManager + variables de entorno
- ✅ Compatibilidad hacia atrás mantenida (funciona con variables de entorno)

---

## 📝 CONFIGURACIÓN

### Campos Requeridos (Al Menos Uno)

**Opción 1: Webhook URL** (más simple):
- `webhookUrl`: URL del webhook de Slack (formato: `https://hooks.slack.com/services/T.../B.../...`)
- `channel`: Canal por defecto (opcional, ej: `#notifications`)

**Opción 2: Bot Token** (más flexible):
- `botToken`: Token del bot de Slack (formato: `xoxb-...` o `xoxp-...`)
- `channel`: Canal por defecto (opcional, ej: `#notifications` o `C0123456789`)

**Opción 3: Ambos**:
- Se puede configurar ambos, pero solo se necesita uno

### Validaciones Implementadas

1. **Validación Especial - Al Menos Uno Requerido**:
   - Se requiere AL MENOS uno de: `webhookUrl` o `botToken`
   - Si falta ambos, la API se considera no configurada

2. **Formato de Webhook URL**:
   - Debe ser una URL válida
   - Debe empezar con `https://hooks.slack.com/`
   - Formato: `https://hooks.slack.com/services/T.../B.../...`

3. **Formato de Bot Token**:
   - Debe empezar con `xoxb-` (Bot User OAuth Token) o `xoxp-` (User OAuth Token)
   - Formato: `xoxb-...` (bot token) o `xoxp-...` (user token)

---

## 🔄 COMPATIBILIDAD

### Orden de Búsqueda de Credenciales

1. **CredentialsManager** (Base de datos):
   - Busca credenciales guardadas para el usuario
   - Prioridad si existen

2. **Variables de Entorno** (Fallback):
   - `SLACK_WEBHOOK_URL` (opcional, pero requerido si no hay botToken)
   - `SLACK_BOT_TOKEN` (opcional, pero requerido si no hay webhookUrl)
   - `SLACK_CHANNEL` (opcional, default: `#ivan-reseller`)

### Nombres de Campos Soportados

El sistema acepta múltiples variantes de nombres de campos para máxima compatibilidad:

**Webhook URL**:
- `webhookUrl` (camelCase, preferido)
- `SLACK_WEBHOOK_URL` (UPPER_CASE, legacy)

**Bot Token**:
- `botToken` (camelCase, preferido)
- `SLACK_BOT_TOKEN` (UPPER_CASE, legacy)

**Channel**:
- `channel` (camelCase, preferido)
- `SLACK_CHANNEL` (UPPER_CASE, legacy)

---

## 🔧 DOS MÉTODOS DE CONFIGURACIÓN

### Método 1: Webhook URL (Recomendado para uso simple)

**Ventajas**:
- ✅ Más simple de configurar
- ✅ Solo necesita una URL
- ✅ Perfecto para notificaciones unidireccionales

**Pasos**:
1. Ir a https://api.slack.com/apps
2. Crear una nueva app o usar una existente
3. Activar "Incoming Webhooks"
4. Crear un webhook para el canal deseado
5. Copiar la URL del webhook
6. Pegar en `webhookUrl`

### Método 2: Bot Token (Recomendado para uso avanzado)

**Ventajas**:
- ✅ Más flexible (permite leer mensajes, interactuar, etc.)
- ✅ Permite cambiar de canal dinámicamente
- ✅ Mejor para integraciones complejas

**Pasos**:
1. Ir a https://api.slack.com/apps
2. Crear una nueva app o usar una existente
3. Ir a "OAuth & Permissions"
4. Agregar scopes necesarios (ej: `chat:write`, `channels:read`)
5. Instalar app en el workspace
6. Copiar el "Bot User OAuth Token" (xoxb-...)
7. Pegar en `botToken`

---

## 💰 COSTOS

- **Gratis**: Hasta 10,000 requests/mes
- **Opcional**: Planes pagos para más límites

---

## 🧪 PRUEBAS RECOMENDADAS

1. **Configurar Slack con Webhook URL**:
   - Guardar solo `webhookUrl` en Settings → API Settings → Slack
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use esta configuración

2. **Configurar Slack con Bot Token**:
   - Guardar solo `botToken` en Settings → API Settings → Slack
   - Verificar que el estado muestre "Configurado y funcionando"
   - Verificar que el servicio use esta configuración

3. **Validación de Formato**:
   - Intentar guardar Webhook URL inválido (ej: sin `https://hooks.slack.com/`) y verificar error
   - Intentar guardar Bot Token inválido (ej: sin `xoxb-` o `xoxp-`) y verificar error

4. **Validación de Al Menos Uno**:
   - Intentar guardar sin `webhookUrl` ni `botToken` y verificar error
   - Verificar que el mensaje de error sea claro sobre el requisito

5. **Normalización de Campos**:
   - Guardar credenciales con `SLACK_WEBHOOK_URL` y verificar que se normalice a `webhookUrl`
   - Guardar credenciales con `SLACK_BOT_TOKEN` y verificar que se normalice a `botToken`

---

**Última actualización**: 2025-12-11

