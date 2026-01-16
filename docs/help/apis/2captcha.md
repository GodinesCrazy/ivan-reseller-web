# 🔧 Configuración de 2Captcha API

**Última actualización:** 2025-01-11  
**Categoría:** Captcha (Automatización)  
**Requisito:** Opcional (resolver captchas automáticamente)

---

## 📋 ¿Para qué se usa en Ivan Reseller?

La integración con 2Captcha API permite:
- **Resolver captchas automáticamente** durante scraping
- **Evitar bloqueos** por captchas en AliExpress y otros sitios
- **Mejorar tasa de éxito** de scraping automatizado

**Módulos que la usan:**
- `backend/src/services/advanced-scraper.service.ts` - Servicio de scraping
- `backend/src/services/stealth-scraping.service.ts` - Scraping con stealth
- `frontend/src/pages/APISettings.tsx` - Configuración en UI

**Nota:** Esta API es opcional. Si no se configura, el scraping puede fallar si encuentra captchas.

---

## 🔑 Campos Requeridos

| Campo (UI) | Nombre en Backend | Tipo | Requerido | Descripción |
|------------|-------------------|------|-----------|-------------|
| API Key | `CAPTCHA_API_KEY` | Password | ✅ Sí | API Key de 2Captcha |

**Ambientes:**
- ❌ No soporta ambientes (solo producción)

---

## 📝 Paso a Paso: Obtener Credenciales

### 1. Crear Cuenta en 2Captcha

1. Ir a [2Captcha](https://2captcha.com/)
2. Hacer clic en **"Sign Up"** o **"Register"**
3. Completar registro con email y contraseña

### 2. Obtener API Key

1. Iniciar sesión en [2Captcha Dashboard](https://2captcha.com/2captcha-api)
2. Ir a **"Settings"** → **"API Key"**
3. Copiar tu **API Key**

### 3. Verificar Plan

- **Pay-as-you-go:** Pago por captcha resuelto
- **Paid Plans:** Planes con créditos prepagados

**Documentación oficial:**
- [2Captcha API Documentation](https://2captcha.com/2captcha-api)
- [2Captcha Dashboard](https://2captcha.com/)

---

## ⚙️ Paso a Paso: Configurar en Ivan Reseller

### 1. Acceder a Configuración de APIs

1. Iniciar sesión en Ivan Reseller
2. Ir a **"Configuración"** → **"APIs"** (o `/api-settings`)
3. Buscar la tarjeta **"2Captcha API"**

### 2. Completar Campos

1. **API Key:** Pegar el API Key obtenido de 2Captcha

### 3. Guardar y Probar

1. Hacer clic en **"Guardar"**
2. Hacer clic en **"Probar Conexión"** (botón de prueba)

---

## ✅ Cómo Validar que Quedó Bien

### Verificación en UI:

1. **Estado de la API:**
   - En la tarjeta de 2Captcha, el estado debe mostrar **"Sesión activa"** (badge verde)

2. **Botón de Prueba:**
   - Hacer clic en **"Probar Conexión"**
   - Debe mostrar: **"✅ Conexión exitosa"** o mensaje similar

### Verificación Técnica:

**Endpoint de prueba:**
```bash
POST /api/api-credentials/2captcha/test
Headers: Authorization: Bearer <token>
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "API configurada correctamente",
  "data": {
    "apiName": "2captcha",
    "status": "healthy",
    "isConfigured": true,
    "isAvailable": true
  }
}
```

---

## 🚨 Errores Típicos y Soluciones

### Error 1: "API Key not found"

**Causa:** El API Key no está configurado o está vacío.

**Solución:**
- Verificar que el API Key esté completo (sin espacios)
- Verificar que se haya guardado correctamente

### Error 2: "Invalid API Key"

**Causa:** El API Key no es válido o ha expirado.

**Solución:**
- Verificar que el API Key sea correcto en 2Captcha Dashboard
- Regenerar el API Key si es necesario

### Error 3: "Insufficient balance"

**Causa:** No hay créditos suficientes en la cuenta de 2Captcha.

**Solución:**
- Recargar créditos en 2Captcha Dashboard
- Verificar el balance disponible

---

## 📚 Referencias

- **Documentación oficial:** [2Captcha API Documentation](https://2captcha.com/2captcha-api)
- **Dashboard:** [2Captcha Dashboard](https://2captcha.com/)

---

## 🔍 Notas Técnicas

- **Almacenamiento:** Las credenciales se guardan en la tabla `ApiCredential` encriptadas con AES-256-GCM
- **Encriptación:** Usa `ENCRYPTION_KEY` del backend
- **Uso:** Se usa automáticamente cuando el scraping encuentra captchas
- **Opcional:** Esta API es opcional; el scraping puede fallar si encuentra captchas sin esta API

---

**Última actualización:** 2025-01-11  
**Mantenido por:** Equipo de Desarrollo Ivan Reseller

