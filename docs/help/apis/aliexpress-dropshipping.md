# 🔧 Configuración de AliExpress Dropshipping API

**Última actualización:** 2025-01-11  
**Categoría:** Compra Automática (API Oficial)  
**Requisito:** Recomendado para compras automáticas

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con AliExpress Dropshipping API permite:
- **Crear órdenes automatizadas** en AliExpress usando la API oficial
- **Comprar productos automáticamente** cuando se reciben órdenes
- **Gestionar compras** de forma rápida y confiable (más que automatización con navegador)

**Módulos que la usan:**
- `backend/src/services/aliexpress-auto-purchase.service.ts` - Servicio de compra automática
- `backend/src/services/marketplace.service.ts` - Integración con marketplaces
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta API es más rápida y confiable que AliExpress Auto-Purchase (automatización con navegador). Se recomienda usar esta API si está disponible.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| App Key | `appKey` | Text | ✅ Sí | App Key de AliExpress Open Platform |
| App Secret | `appSecret` | Password | ✅ Sí | App Secret para calcular firma de peticiones |
| Access Token | `accessToken` | Password | ✅ Sí | Token OAuth obtenido después de autorizar |
| Refresh Token | `refreshToken` | Password | ❌ No | Token para renovar automáticamente el Access Token |
| Sandbox | `sandbox` | Text | ✅ Sí | `true` para pruebas, `false` para producción |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (producción)

**OAuth requerido:**
- ✅ Sí, se requiere completar el flujo OAuth para obtener Access Token y Refresh Token

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en AliExpress Open Platform

1. Ir a [AliExpress Open Platform](https://console.aliexpress.com/)
2. Iniciar sesión con tu cuenta de AliExpress
3. Ir a **"My Apps"** → **"Create App"**
4. Seleccionar tipo de aplicación: **"Dropshipping API"**

### 2. Completar Información de la Aplicación

- **App Name:** Nombre descriptivo (ej: "Ivan Reseller")
- **App Type:** Dropshipping API
- **Description:** Descripción del uso

### 3. Obtener Credenciales

Después de crear la aplicación, AliExpress proporciona:
- **App Key:** Identificador único de la aplicación
- **App Secret:** Secret para firmar peticiones (guardar de forma segura)

### 4. Completar Flujo OAuth

1. Usar el App Key y App Secret para iniciar el flujo OAuth
2. El usuario será redirigido a AliExpress para autorizar
3. Después de autorizar, se obtienen:
   - **Access Token:** Token de acceso temporal
   - **Refresh Token:** Token para renovar el Access Token

**Documentación oficial:**
- [AliExpress Open Platform](https://developer.alibaba.com/help/en/portal)
- [AliExpress Dropshipping API Documentation](https://developer.alibaba.com/help/en/portal)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"AliExpress Dropshipping API"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (producción)
2. **App Key:** Pegar el App Key obtenido de AliExpress
3. **App Secret:** Pegar el App Secret obtenido de AliExpress
4. **Access Token:** Pegar el Access Token obtenido del flujo OAuth
5. **Refresh Token (Opcional):** Pegar el Refresh Token si está disponible
6. **Sandbox:** Marcar `true` para pruebas o `false` para producción

### 3. Completar Autorización OAuth

1. Si es la primera vez, hacer clic en **"Autorizar con AliExpress"** (si está disponible)
2. Serás redirigido a AliExpress para autorizar
3. Después de autorizar, los tokens se guardan automáticamente

### 4. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de AliExpress Dropshipping, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/aliexpress-dropshipping/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Conexión exitosa",
  "data": {
    "apiName": "aliexpress-dropshipping",
    "environment": "sandbox",
    "status": "healthy"
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Invalid App Key"

**Causa:** El App Key no es válido o es de otro tipo de aplicación.

**Solución:**
- Verificar que el App Key sea de tipo "Dropshipping API"
- Verificar que el App Key esté completo (sin espacios)

### Error 2: "Signature mismatch"

**Causa:** El App Secret no coincide con el App Key.

**Solución:**
- Verificar que el App Secret sea el correcto para el App Key
- Asegurarse de que no haya espacios o caracteres extra

### Error 3: "Invalid Access Token"

**Causa:** El Access Token ha expirado o no es válido.

**Solución:**
- Regenerar el Access Token completando el flujo OAuth nuevamente
- Verificar que el Refresh Token sea válido (si está disponible)

---

## 📚 Referencias

- **Documentación oficial:** [AliExpress Open Platform](https://developer.alibaba.com/help/en/portal)
- **Dropshipping API:** [AliExpress Dropshipping API Documentation](https://developer.alibaba.com/help/en/portal)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **OAuth:** El sistema renueva automáticamente los Access Tokens usando el Refresh Token
- **Recomendación:** Esta API es más rápida y confiable que AliExpress Auto-Purchase (automatización con navegador)

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

