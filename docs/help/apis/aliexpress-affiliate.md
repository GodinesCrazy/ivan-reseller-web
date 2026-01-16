# 🔧 Configuración de AliExpress Affiliate API

**Última actualización:** 2025-01-11  
**Categoría:** Búsqueda (Oportunidades)  
**Requisito:** Recomendado para búsqueda de oportunidades

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con AliExpress Affiliate API permite:
- **Extraer datos de productos** (títulos, precios, imágenes) desde AliExpress
- **Buscar oportunidades de negocio** de forma rápida y confiable
- **Obtener información actualizada** de productos sin scraping (más rápido y estable)

**Módulos que la usan:**
- `backend/src/services/advanced-scraper.service.ts` - Servicio de scraping (usa API cuando está disponible)
- `backend/src/services/opportunity-finder.service.ts` - Búsqueda de oportunidades
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Si no se configura, el sistema usa scraping como alternativa (más lento y menos confiable).

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| App Key | `appKey` | Text | ✅ Sí | App Key de AliExpress Open Platform |
| App Secret | `appSecret` | Password | ✅ Sí | App Secret para calcular firma de peticiones |
| Tracking ID | `trackingId` | Text | ❌ No | ID de afiliado para generar enlaces (opcional) |
| Sandbox | `sandbox` | Text | ✅ Sí | `true` para pruebas, `false` para producción |

**Ambientes soportados:**
- ✅ Sandbox (pruebas)
- ✅ Production (producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Aplicación en AliExpress Open Platform

1. Ir a [AliExpress Open Platform](https://console.aliexpress.com/)
2. Iniciar sesión con tu cuenta de AliExpress
3. Ir a **"My Apps"** → **"Create App"**
4. Seleccionar tipo de aplicación: **"Affiliate API"**

### 2. Completar Información de la Aplicación

- **App Name:** Nombre descriptivo (ej: "Ivan Reseller")
- **App Type:** Affiliate API
- **Description:** Descripción del uso

### 3. Obtener Credenciales

Después de crear la aplicación, AliExpress proporciona:
- **App Key:** Identificador único de la aplicación
- **App Secret:** Secret para firmar peticiones (guardar de forma segura)

### 4. Configurar Tracking ID (Opcional)

Si tienes un Tracking ID de afiliado:
1. Ir a [AliExpress Affiliate Center](https://portals.aliexpress.com/)
2. Obtener tu Tracking ID
3. Configurarlo en Ivan Reseller (opcional, mejora tracking de comisiones)

**Documentación oficial:**
- [AliExpress Open Platform](https://developer.alibaba.com/help/en/portal)
- [AliExpress Affiliate API Documentation](https://developer.alibaba.com/help/en/portal)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"AliExpress Affiliate API"**

### 2. Completar Campos

1. **Seleccionar ambiente:** Sandbox (pruebas) o Production (producción)
2. **App Key:** Pegar el App Key obtenido de AliExpress
3. **App Secret:** Pegar el App Secret obtenido de AliExpress
4. **Tracking ID (Opcional):** Pegar tu Tracking ID si lo tienes
5. **Sandbox:** Marcar `true` para pruebas o `false` para producción

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de AliExpress Affiliate, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/aliexpress-affiliate/test
Headers: Authorization: Bearer <token>
Body: { "environment": "sandbox" } # o "production"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Conexión exitosa",
  "data": {
    "apiName": "aliexpress-affiliate",
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
- Verificar que el App Key sea de tipo "Affiliate API"
- Verificar que el App Key esté completo (sin espacios)

### Error 2: "Signature mismatch"

**Causa:** El App Secret no coincide con el App Key.

**Solución:**
- Verificar que el App Secret sea el correcto para el App Key
- Asegurarse de que no haya espacios o caracteres extra

### Error 3: "Sandbox/production mismatch"

**Causa:** El ambiente seleccionado no coincide con el tipo de aplicación.

**Solución:**
- Verificar que el ambiente (sandbox/production) coincida con el tipo de aplicación en AliExpress
- Si la app es de producción, usar `sandbox: false`

---

## 📚 Referencias

- **Documentación oficial:** [AliExpress Open Platform](https://developer.alibaba.com/help/en/portal)
- **Affiliate Center:** [AliExpress Affiliate](https://portals.aliexpress.com/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Ambientes:** Las credenciales de sandbox y production se guardan por separado
- **Alternativa:** Si no se configura, el sistema usa scraping (más lento pero funciona)

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

