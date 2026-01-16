# 🔧 Configuración de PayPal Payouts

**Última actualización:** 2025-01-11  
**Categoría:** Pagos (Comisiones)  
**Requisito:** Opcional (pagar comisiones automáticamente)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con PayPal Payouts permite:
- **Pagar comisiones automáticamente** a usuarios/afiliados
- **Procesar pagos masivos** de forma eficiente
- **Gestionar transacciones** de comisiones desde el sistema

**Módulos que la usan:**
- `backend/src/services/paypal-payout.service.ts` - Servicio de pagos PayPal
- `backend/src/api/routes/commissions.routes.ts` - Endpoints de comisiones
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta API es opcional. Si no se configura, las comisiones se pueden gestionar manualmente.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| Client ID | `PAYPAL_CLIENT_ID` | Text | ✅ Sí | Client ID de PayPal (formato: `AYSq3RDGsmBLJE...`) |
| Client Secret | `PAYPAL_CLIENT_SECRET` | Password | ✅ Sí | Client Secret de PayPal |
| Mode | `PAYPAL_MODE` | Text | ✅ Sí | `sandbox` para pruebas o `live` para producción |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (live)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en PayPal Developer

1. Ir a [PayPal Developer Portal](https://developer.paypal.com/)
2. Iniciar sesión con tu cuenta de PayPal
3. Ir a **"Dashboard"** → **"My Apps & Credentials"**
4. Hacer clic en **"Create App"**

### 2. Configurar Aplicación

1. **App Name:** Nombre descriptivo (ej: "Ivan Reseller")
2. **Merchant:** Seleccionar tu cuenta de negocio
3. **Features:** Seleccionar **"Payouts"**
4. Hacer clic en **"Create App"**

### 3. Obtener Credenciales

Después de crear la aplicación, PayPal proporciona:
- **Client ID:** Formato `AYSq3RDGsmBLJE...`
- **Client Secret:** Formato `EGnHDxD_qRPOmeKm...`

### 4. Configurar Sandbox (Opcional para Pruebas)

1. En PayPal Developer, ir a **"Sandbox"** → **"Accounts"**
2. Crear cuentas de prueba si es necesario
3. Usar credenciales de sandbox para pruebas

**Documentación oficial:**
- [PayPal Developer Portal](https://developer.paypal.com/)
- [PayPal Payouts Documentation](https://developer.paypal.com/docs/payouts/)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"PayPal Payouts"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (live)
2. **Client ID:** Pegar el Client ID obtenido de PayPal
3. **Client Secret:** Pegar el Client Secret obtenido de PayPal
4. **Mode:** Seleccionar `sandbox` para pruebas o `live` para producción

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de PayPal, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/paypal/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "paypal",
    "environment": "sandbox",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Environment mismatch"

**Causa:** El environment en las credenciales no coincide con el solicitado.

**Solución:**
- Verificar que el Mode (`sandbox` o `live`) coincida con el ambiente seleccionado
- Asegurarse de usar credenciales del ambiente correcto

### Error 2: "Invalid Client ID"

**Causa:** El Client ID no es válido o es de otra aplicación.

**Solución:**
- Verificar que el Client ID sea correcto en PayPal Developer Portal
- Verificar que el Client ID esté completo (sin espacios)

### Error 3: "Invalid Client Secret"

**Causa:** El Client Secret no coincide con el Client ID.

**Solución:**
- Verificar que el Client Secret sea el correcto para el Client ID
- Regenerar el Client Secret si es necesario

---

## 📚 Referencias

- **Documentación oficial:** [PayPal Developer Portal](https://developer.paypal.com/)
- **Payouts:** [PayPal Payouts Documentation](https://developer.paypal.com/docs/payouts/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **OAuth:** El sistema obtiene Access Tokens automáticamente usando Client ID y Secret
- **Opcional:** Esta API es opcional; las comisiones se pueden gestionar manualmente sin ella

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

