# 🔧 Configuración de eBay Trading API

**Última actualización:** 2025-01-11  
**Categoría:** Marketplace (Publicación)  
**Requisito:** Obligatorio para publicar productos en eBay

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con eBay Trading API permite:
- **Publicar productos** automáticamente en eBay desde oportunidades encontradas
- **Gestionar listados** (actualizar precios, stock, descripciones)
- **Sincronizar ventas** y comisiones desde eBay
- **Obtener datos de productos** existentes en eBay

**Módulos que la usan:**
- `backend/src/services/marketplace.service.ts` - Servicio principal de marketplaces
- `backend/src/api/routes/marketplace.routes.ts` - Endpoints de publicación
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| App ID (Client ID) | `EBAY_APP_ID` | Text | ✅ Sí | Formato: `Nombre-Nombre-[SBX\|PRD]-hash` |
| Dev ID | `EBAY_DEV_ID` | Text | ✅ Sí | Developer ID de eBay |
| Cert ID (Client Secret) | `EBAY_CERT_ID` | Password | ✅ Sí | Cert ID (Client Secret) |
| Redirect URI (RuName) | `EBAY_REDIRECT_URI` | Text | ✅ Sí | RuName de la aplicación |
| User Token | `EBAY_TOKEN` | Password | ❌ No | Token OAuth del usuario (se obtiene automáticamente) |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en eBay Developers

1. Ir a [eBay Developers Portal](https://developer.ebay.com/)
2. Iniciar sesión con tu cuenta de eBay
3. Ir a **"My Account"** → **"Keys & Credentials"**
4. Hacer clic en **"Create an App Key"**

### 2. Completar Información de la Aplicación

- **App Name:** Nombre descriptivo (ej: "Ivan Reseller")
- **App Purpose:** Seleccionar "Sell items on eBay"
- **Redirect URI (RuName):** 
  - Para desarrollo: `http://localhost:5173/auth/callback`
  - Para producción: `https://www.ivanreseller.com/auth/callback`
  - **Nota:** Este valor debe coincidir exactamente con el configurado en Ivan Reseller

### 3. Obtener Credenciales

Después de crear la aplicación, eBay proporciona:
- **App ID (Client ID):** Formato `Nombre-Nombre-PRD-xxxxx` (producción) o `Nombre-Nombre-SBX-xxxxx` (sandbox)
- **Dev ID:** Developer ID único
- **Cert ID (Client Secret):** Secret para autenticación

### 4. Configurar OAuth (Opcional pero Recomendado)

Para obtener el User Token automáticamente:
1. En la página de configuración de eBay, copiar el **RuName**
2. Configurar el **Redirect URI** en Ivan Reseller
3. Usar el botón **"Autorizar con eBay"** en la UI de Ivan Reseller
4. El sistema obtendrá el token automáticamente

**Documentación oficial:**
- [eBay OAuth Guide](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [eBay Trading API Documentation](https://developer.ebay.com/api-docs/static/gs_trading-api-intro.html)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"eBay Trading API"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (producción)
2. **App ID (Client ID):** Pegar el App ID obtenido de eBay
3. **Dev ID:** Pegar el Dev ID obtenido de eBay
4. **Cert ID (Client Secret):** Pegar el Cert ID obtenido de eBay
5. **Redirect URI (RuName):** Pegar el RuName configurado en eBay

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)
3. Si es la primera vez, hacer clic en **"Autorizar con eBay"** para obtener el User Token

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de eBay, el estado debe mostrar **"Sesión activa"** (badge verde)
   - Si muestra **"Requiere acción manual"**, hacer clic en **"Autorizar con eBay"**

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/ebay/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Conexión exitosa",
  "data": {
    "apiName": "ebay",
    "environment": "sandbox",
    "status": "healthy"
  }
}
```

**Logs del backend:**
- Buscar en logs: `"eBay API test successful"` o similar
- No debe haber errores de autenticación

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Invalid App ID"

**Causa:** El App ID no tiene el formato correcto o es de otro ambiente.

**Solución:**
- Verificar que el App ID tenga el formato: `Nombre-Nombre-[SBX|PRD]-hash`
- Verificar que el ambiente seleccionado (sandbox/production) coincida con el App ID
- Sandbox usa `SBX`, Production usa `PRD`

### Error 2: "OAuth token expired" o "Requiere acción manual"

**Causa:** El User Token expiró o no se ha obtenido.

**Solución:**
1. Hacer clic en **"Autorizar con eBay"** en la UI
2. Completar el flujo OAuth en eBay
3. El sistema actualizará el token automáticamente

### Error 3: "Redirect URI mismatch"

**Causa:** El Redirect URI configurado en Ivan Reseller no coincide con el configurado en eBay.

**Solución:**
- Verificar que el **Redirect URI (RuName)** en Ivan Reseller sea exactamente igual al configurado en eBay
- Para desarrollo: `http://localhost:5173/auth/callback`
- Para producción: `https://www.ivanreseller.com/auth/callback`

### Error 4: "Rate limit exceeded"

**Causa:** Se excedió el límite de requests de la API de eBay.

**Solución:**
- Esperar unos minutos antes de volver a intentar
- Verificar el plan de la aplicación en eBay (hay límites según el plan)
- Considerar usar sandbox para pruebas (tiene límites más altos)

---

## 📚 Referencias

- **Documentación oficial:** [eBay Trading API](https://developer.ebay.com/api-docs/static/gs_trading-api-intro.html)
- **OAuth Guide:** [eBay OAuth Tokens](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- **Portal de desarrolladores:** [eBay Developers](https://developer.ebay.com/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **Tokens:** El User Token se renueva automáticamente cuando expira (si está configurado OAuth)

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

