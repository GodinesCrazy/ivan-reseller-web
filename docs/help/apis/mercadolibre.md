# 🔧 Configuración de MercadoLibre API

**Última actualización:** 2025-01-11  
**Categoría:** Marketplace (Publicación)  
**Requisito:** Opcional (mejora cobertura regional)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con MercadoLibre API permite:
- **Publicar productos** automáticamente en MercadoLibre desde oportunidades encontradas
- **Gestionar listados** (actualizar precios, stock, descripciones)
- **Sincronizar ventas** y comisiones desde MercadoLibre
- **Ampliar cobertura regional** en Latinoamérica

**Módulos que la usan:**
- `backend/src/services/marketplace.service.ts` - Servicio principal de marketplaces
- `backend/src/services/mercadolibre.service.ts` - Servicio específico de MercadoLibre
- `backend/src/api/routes/marketplace.routes.ts` - Endpoints de publicación
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta integración es opcional. Si no se configura, el sistema funcionará normalmente pero sin soporte para MercadoLibre.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| Client ID (App ID) | `MERCADOLIBRE_CLIENT_ID` | Text | ✅ Sí | App ID de la aplicación en MercadoLibre |
| Client Secret | `MERCADOLIBRE_CLIENT_SECRET` | Password | ✅ Sí | Client Secret de la aplicación |
| Redirect URI | `MERCADOLIBRE_REDIRECT_URI` | Text | ❌ No | URI de redirección para OAuth (opcional) |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (producción)

**OAuth requerido:**
- ✅ Sí, se requiere completar el flujo OAuth para obtener Access Token y Refresh Token

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en MercadoLibre Developers

1. Ir a [MercadoLibre Developers](https://developers.mercadolibre.com/)
2. Iniciar sesión con tu cuenta de MercadoLibre
3. Ir a **"Tus integraciones"** → **"Crear nueva aplicación"**
4. Completar información:
   - **Nombre de la aplicación:** Nombre descriptivo (ej: "Ivan Reseller")
   - **Tipo:** Seleccionar según tu caso de uso
   - **Redirect URI:** `http://localhost:5173/auth/callback` (o la URL de tu frontend)

### 2. Obtener Credenciales

Después de crear la aplicación, MercadoLibre proporciona:
- **App ID (Client ID):** Número de identificación (ej: `1234567890123456`)
- **Secret Key (Client Secret):** Clave secreta (ej: `abcdefghijklmnop...`)

### 3. Completar Flujo OAuth

1. Usar el App ID y Client Secret para iniciar el flujo OAuth
2. El usuario será redirigido a MercadoLibre para autorizar
3. Después de autorizar, se obtienen:
   - **Access Token:** Token de acceso temporal
   - **Refresh Token:** Token para renovar el Access Token

**Documentación oficial:**
- [MercadoLibre Developers](https://developers.mercadolibre.com/)
- [OAuth Documentation](https://developers.mercadolibre.com/es_ar/autenticacion-y-autorizacion)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"MercadoLibre API"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (producción)
2. **Client ID (App ID):** Pegar el App ID obtenido de MercadoLibre
3. **Client Secret:** Pegar el Client Secret obtenido de MercadoLibre
4. **Redirect URI (Opcional):** Configurar si es necesario para OAuth

### 3. Completar Autorización OAuth

1. Si es la primera vez, hacer clic en **"Autorizar con MercadoLibre"** (si está disponible)
2. Serás redirigido a MercadoLibre para autorizar
3. Después de autorizar, los tokens se guardan automáticamente

### 4. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de MercadoLibre, el estado debe mostrar **"Sesión activa"** (badge verde)
   - Si solo hay credenciales básicas pero falta OAuth, mostrará **"Requiere acción manual"** (badge amarillo)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/mercadolibre/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "mercadolibre",
    "environment": "sandbox",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "Falta token OAuth de MercadoLibre"

**Causa:** Las credenciales básicas están guardadas pero falta completar el flujo OAuth.

**Solución:**
- Completar el flujo OAuth desde la UI (botón "Autorizar con MercadoLibre")
- Verificar que los tokens OAuth se hayan guardado correctamente

### Error 2: "Invalid Client ID"

**Causa:** El Client ID no es válido o es de otra aplicación.

**Solución:**
- Verificar que el Client ID sea correcto en MercadoLibre Developers
- Verificar que el Client ID esté completo (sin espacios)

### Error 3: "Token expired"

**Causa:** El Access Token ha expirado y el Refresh Token no funciona.

**Solución:**
- Regenerar los tokens completando el flujo OAuth nuevamente
- Verificar que el Refresh Token sea válido

---

## 📚 Referencias

- **Documentación oficial:** [MercadoLibre Developers](https://developers.mercadolibre.com/)
- **OAuth:** [Autenticación y Autorización](https://developers.mercadolibre.com/es_ar/autenticacion-y-autorizacion)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **OAuth:** El sistema renueva automáticamente los Access Tokens usando el Refresh Token
- **Opcional:** Esta API es opcional; el sistema funciona sin ella pero sin soporte para MercadoLibre

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

