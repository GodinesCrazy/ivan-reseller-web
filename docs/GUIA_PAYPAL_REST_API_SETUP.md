# 🔐 Guía: Configuración de PayPal REST API para IvanReseller

**Objetivo:** Obtener credenciales de PayPal REST API para validación de balance y pagos automáticos

---

## 📋 PASO 1: Crear Aplicación en PayPal Developer Dashboard

### Opción Recomendada: **REST API App**

1. **Accede a:** https://developer.paypal.com/dashboard/
2. **Inicia sesión** con tu cuenta de PayPal Business
3. **Ve a:** "My Apps & Credentials" → "REST API apps"
4. **Clic en:** "Create App" o "+ Create App"

### Configuración de la Aplicación:

**Nombre de la App:**
```
IvanReseller - Dropshipping Automation
```

**Tipo de App:**
- ✅ **MERCHANT** (Recomendado) - Para pagos y balance de cuenta
- ❌ NO uses "PARTNER" (solo para integraciones complejas)

**Ambiente:**
- Para desarrollo: **Sandbox** (gratis, para pruebas)
- Para producción: **Live** (requiere cuenta Business verificada)

---

## 🔑 PASO 2: Obtener Credenciales

Una vez creada la app, verás:

### **Client ID** (Público)
```
Ejemplo: AbCdEf123456GhIjKl789012MnOpQr345678StUvWx
```

### **Secret** (Privado - Solo se muestra una vez)
```
⚠️ IMPORTANTE: Guárdalo inmediatamente, no se mostrará de nuevo
```

---

## 🔐 PASO 3: Configurar Permisos (Scopes)

Para que el sistema pueda validar balance y realizar pagos, necesitas estos **scopes**:

### Permisos Mínimos Requeridos:

1. **`wallet:read`** ⭐ **CRÍTICO** - Para obtener balance de cuenta
2. **`payouts:write`** - Para enviar pagos automáticos
3. **`payments:read`** - Para leer transacciones
4. **`reporting:read`** - Para obtener historial de transacciones (fallback de balance)

### Cómo Configurar Scopes:

1. En el Dashboard, ve a tu aplicación
2. Busca sección **"Advanced Options"** o **"App Settings"**
3. En **"Scopes"** o **"Permissions"**, agrega:
   - `wallet:read`
   - `payouts:write`
   - `payments:read`
   - `reporting:read`

**Nota:** Si algunos scopes no están disponibles en la UI, pueden solicitarse vía:
- PayPal Developer Support
- O pueden estar incluidos automáticamente con una cuenta Business verificada

---

## 💾 PASO 4: Guardar Credenciales en IvanReseller

### Opción A: Desde la UI (Recomendado)

1. Ve a: **Dashboard → Settings → API Settings**
2. Busca la sección **"PayPal"**
3. Ingresa:
   - **Client ID:** (el Client ID de tu app)
   - **Client Secret:** (el Secret de tu app)
   - **Environment:** `sandbox` o `production`
   - **Mode:** Selecciona según tu ambiente

4. **Haz clic en "Save"** o "Test Connection"

### Opción B: Manualmente en Base de Datos

Si necesitas configurarlo manualmente, los datos se guardan en:
- Tabla: `api_credentials`
- Provider: `paypal`
- Environment: `sandbox` o `production`

---

## ✅ PASO 5: Validar Configuración

### Desde el Código:

El sistema intentará estos métodos en orden:

1. **Wallet API** (`/v1/wallet/balance`)
   - Requiere: `wallet:read` scope
   - Más preciso ✅
   - Puede no estar disponible en todas las cuentas

2. **Reporting API** (`/v1/reporting/transactions`)
   - Requiere: `reporting:read` scope
   - Estima balance desde transacciones
   - Menos preciso pero más disponible

3. **Fallback: Capital Interno**
   - Si ninguna API está disponible
   - Usa validación de capital de trabajo configurada

### Test Manual:

```bash
# Desde el backend
cd backend
npm run test:paypal

# O usando curl (desde terminal)
curl -X POST https://api-m.sandbox.paypal.com/v1/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "CLIENT_ID:SECRET" \
  -d "grant_type=client_credentials"
```

---

## 🚨 IMPORTANTE: Diferencias Sandbox vs Production

### **Sandbox (Desarrollo/Testing)**
- ✅ Gratis
- ✅ No usa dinero real
- ✅ Ideal para desarrollo
- ⚠️ Balance puede ser simulado
- ⚠️ Wallet API puede no funcionar igual

### **Production (Live)**
- ⚠️ Requiere cuenta PayPal Business verificada
- ⚠️ Usa dinero real
- ✅ Balance real y preciso
- ✅ Wallet API funciona completamente
- ✅ Reporting API tiene datos reales

---

## 📝 Configuración en el Sistema

### Archivo de Configuración:

El sistema busca credenciales en este orden:

1. **Base de Datos** (Usuario específico) ← **Recomendado**
   - Tabla: `api_credentials`
   - Provider: `paypal`
   - Se obtiene con: `CredentialsManager.getCredentialEntry(userId, 'paypal', environment)`

2. **Variables de Entorno** (Fallback)
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_ENVIRONMENT` (sandbox/production)

### Código de Ejemplo:

```typescript
// El sistema ya está configurado para usar credenciales de usuario
const paypalService = await PayPalPayoutService.fromUserCredentials(userId);

// Esto intentará obtener credenciales de:
// 1. Base de datos (api_credentials)
// 2. Variables de entorno (fallback)
```

---

## 🔍 Verificar que Funciona

### Desde el Dashboard de IvanReseller:

1. Ve a: **Dashboard → Settings → API Settings**
2. Busca la sección **"PayPal"**
3. Haz clic en **"Test Connection"**
4. Deberías ver:
   - ✅ "PayPal connection successful"
   - O detalles del error si hay problemas

### Logs del Sistema:

Si está funcionando, verás en los logs:
```
PayPal balance retrieved successfully from Wallet API
  available: 1250.50
  currency: USD
  environment: sandbox
```

---

## ❓ Preguntas Frecuentes

### ¿Necesito una cuenta Business?

**Sí**, para usar REST API necesitas:
- PayPal Business Account
- Verificación de identidad completada (para producción)

### ¿Puedo usar Personal Account?

**No**, REST API requiere cuenta Business.

### ¿Qué pasa si no tengo `wallet:read`?

El sistema usará Reporting API como fallback, o validación de capital interno.
Esto funciona, pero es menos preciso.

### ¿Sandbox tiene balance real?

No, en sandbox el balance es simulado. Para pruebas reales usa Production.

---

## 🎯 Resumen Rápido

1. ✅ Crear **REST API App** en PayPal Developer Dashboard
2. ✅ Tipo: **MERCHANT** (no PARTNER)
3. ✅ Copiar **Client ID** y **Secret**
4. ✅ Configurar scopes: `wallet:read`, `payouts:write`, `reporting:read`
5. ✅ Guardar en IvanReseller: **Settings → API Settings → PayPal**
6. ✅ Test: **"Test Connection"** en la UI

---

**¿Necesitas ayuda?** Revisa los logs del sistema o contacta soporte.

