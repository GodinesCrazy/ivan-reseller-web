# 🔧 Configuración de AliExpress Auto-Purchase

**Última actualización:** 2025-01-11  
**Categoría:** Compra Automática (Automatización)  
**Requisito:** Opcional (compra automática con navegador)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con AliExpress Auto-Purchase permite:
- **Comprar productos automáticamente** en AliExpress cuando se reciben órdenes
- **Automatizar el proceso de dropshipping** usando automatización con navegador
- **Gestionar compras** sin intervención manual

**Módulos que la usan:**
- `backend/src/services/aliexpress-auto-purchase.service.ts` - Servicio de compra automática
- `backend/src/services/stealth-scraping.service.ts` - Automatización con navegador
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta integración usa automatización con navegador (Puppeteer/Chromium). Se recomienda usar AliExpress Dropshipping API si está disponible (más rápida y confiable).

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| Email / Username | `email` | Text | ✅ Sí | Email o username de tu cuenta de AliExpress |
| Password | `password` | Password | ✅ Sí | Contraseña de tu cuenta de AliExpress |
| 2FA Habilitado | `twoFactorEnabled` | Text | ❌ No | `true` si tienes 2FA activado, `false` si no |
| 2FA Secret (TOTP) | `twoFactorSecret` | Password | ❌ No | Secret para generar códigos TOTP si tienes 2FA |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

**Nota:** Si tu cuenta tiene 2FA habilitado, debes proporcionar el Secret TOTP.

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear/Verificar Cuenta en AliExpress

1. Ir a [AliExpress](https://www.aliexpress.com/)
2. Crear una cuenta o iniciar sesión con tu cuenta existente
3. Verificar que la cuenta esté activa y funcional

### 2. Configurar 2FA (Opcional pero Recomendado)

1. Ir a **"Account"** → **"Security"** → **"Two-Factor Authentication"**
2. Habilitar 2FA si lo deseas
3. Si habilitas 2FA, guardar el **Secret TOTP** (necesario para automatización)

**Nota:** Si habilitas 2FA, debes proporcionar el Secret TOTP en Ivan Reseller.

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"AliExpress Auto-Purchase"**

### 2. Completar Campos

1. **Email / Username:** Pegar el email o username de tu cuenta de AliExpress
2. **Password:** Pegar la contraseña de tu cuenta de AliExpress
3. **2FA Habilitado:** Marcar `true` si tienes 2FA activado, `false` si no
4. **2FA Secret (TOTP):** Si tienes 2FA, pegar el Secret TOTP

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba, si está disponible)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de AliExpress Auto-Purchase, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"** (si está disponible)
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/aliexpress/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "aliexpress",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Invalid email or password"

**Causa:** Las credenciales de AliExpress no son válidas.

**Solución:**
- Verificar que el email/username y password sean correctos
- Intentar iniciar sesión manualmente en AliExpress para verificar

### Error 2: "2FA required but not provided"

**Causa:** La cuenta tiene 2FA habilitado pero no se proporcionó el Secret TOTP.

**Solución:**
- Habilitar 2FA en AliExpress y obtener el Secret TOTP
- Configurar el Secret TOTP en Ivan Reseller

### Error 3: "Browser automation failed"

**Causa:** La automatización con navegador falló (captcha, bloqueo, etc.).

**Solución:**
- Verificar que Chromium/Puppeteer esté disponible
- Considerar usar AliExpress Dropshipping API (más confiable)
- Verificar que no haya bloqueos de IP

---

## 📚 Referencias

- **AliExpress:** [AliExpress](https://www.aliexpress.com/)
- **2FA Setup:** Configurar 2FA en tu cuenta de AliExpress

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Automatización:** Usa Puppeteer/Chromium para automatizar el navegador
- **Alternativa:** Se recomienda usar AliExpress Dropshipping API si está disponible (más rápida y confiable)
- **Seguridad:** Las credenciales se almacenan de forma segura y encriptada

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

