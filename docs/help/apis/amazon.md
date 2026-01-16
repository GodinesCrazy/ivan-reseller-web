# 🔧 Configuración de Amazon SP-API

**Última actualización:** 2025-01-11  
**Categoría:** Marketplace (Publicación)  
**Requisito:** Obligatorio para publicar productos en Amazon

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con Amazon SP-API permite:
- **Publicar productos** automáticamente en Amazon desde oportunidades encontradas
- **Gestionar listados** (actualizar precios, stock, descripciones)
- **Sincronizar ventas** y comisiones desde Amazon
- **Obtener datos de productos** existentes en Amazon

**Módulos que la usan:**
- `backend/src/services/marketplace.service.ts` - Servicio principal de marketplaces
- `backend/src/services/amazon.service.ts` - Servicio específico de Amazon
- `backend/src/api/routes/marketplace.routes.ts` - Endpoints de publicación
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| Client ID (LWA) | `AMAZON_CLIENT_ID` | Text | ✅ Sí | Client ID de Login with Amazon (LWA) |
| Client Secret | `AMAZON_CLIENT_SECRET` | Password | ✅ Sí | Client Secret de LWA |
| Refresh Token | `AMAZON_REFRESH_TOKEN` | Password | ✅ Sí | Refresh Token OAuth de Amazon |
| Region | `AMAZON_REGION` | Text | ✅ Sí | Región de la API (ej: `us-east-1`, `eu-west-1`) |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en Amazon Seller Central

1. Ir a [Amazon Seller Central](https://sellercentral.amazon.com/)
2. Iniciar sesión con tu cuenta de vendedor
3. Ir a **"Apps & Services"** → **"Develop Apps"**
4. Hacer clic en **"Create new app client"**

### 2. Configurar Login with Amazon (LWA)

1. En la configuración de la app, seleccionar **"Login with Amazon"**
2. Completar información:
   - **App Name:** Nombre descriptivo (ej: "Ivan Reseller")
   - **App Description:** Descripción del uso
3. Guardar y obtener:
   - **Client ID (LWA Client ID):** Formato `amzn1.application-oa2-client...`
   - **Client Secret:** Formato `amzn1.oa2-cs.v1...`

### 3. Obtener Refresh Token

1. Ir a [Amazon SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/)
2. Seguir el flujo OAuth para obtener:
   - **Refresh Token:** Formato `Atzr|IwEB...`
   - Este token se usa para obtener Access Tokens automáticamente

### 4. Configurar Region

- **us-east-1:** Estados Unidos
- **eu-west-1:** Europa
- **us-west-2:** Estados Unidos (Oeste)
- Consultar [Amazon SP-API Regions](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints) para la lista completa

**Documentación oficial:**
- [Amazon SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/)
- [Login with Amazon](https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"Amazon SP-API"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (producción)
2. **Client ID (LWA):** Pegar el Client ID obtenido de Amazon
3. **Client Secret:** Pegar el Client Secret obtenido de Amazon
4. **Refresh Token:** Pegar el Refresh Token obtenido del flujo OAuth
5. **Region:** Seleccionar la región correspondiente (ej: `us-east-1`)

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de Amazon SP-API, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/amazon/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Conexión exitosa",
  "data": {
    "apiName": "amazon",
    "environment": "sandbox",
    "status": "healthy"
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Invalid Client ID"

**Causa:** El Client ID no es válido o es de otro tipo de aplicación.

**Solución:**
- Verificar que el Client ID sea de tipo "Login with Amazon (LWA)"
- Verificar que el Client ID esté completo (sin espacios)

### Error 2: "Invalid Refresh Token"

**Causa:** El Refresh Token ha expirado o no es válido.

**Solución:**
- Regenerar el Refresh Token siguiendo el flujo OAuth de Amazon
- Verificar que el Refresh Token sea del ambiente correcto (sandbox/production)

### Error 3: "Region mismatch"

**Causa:** La región no coincide con la cuenta de Amazon.

**Solución:**
- Verificar que la región corresponda a tu cuenta de vendedor
- Consultar [Amazon SP-API Regions](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints)

---

## 📚 Referencias

- **Documentación oficial:** [Amazon SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/)
- **Login with Amazon:** [LWA Console](https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html)
- **Regiones:** [SP-API Endpoints](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **OAuth:** El sistema renueva automáticamente los Access Tokens usando el Refresh Token

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

