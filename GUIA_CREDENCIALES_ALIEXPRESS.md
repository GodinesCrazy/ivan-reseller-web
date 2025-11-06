# 🔑 GUÍA: Credenciales de AliExpress

**Fecha:** 2025-01-11  
**Importante:** ⚠️ **AliExpress NO tiene API oficial**

---

## 📋 ¿QUÉ CREDENCIALES NECESITAS?

### ✅ **RESPUESTA CORTA:**
**SÍ, necesitas tu usuario y contraseña NORMAL de AliExpress.**

AliExpress **NO tiene una API oficial** como eBay o Amazon. El sistema usa **automatización con navegador** (Puppeteer) para:
- Buscar productos
- Hacer tracking de pedidos
- Comprar automáticamente cuando hay una venta

---

## 🔍 ¿POR QUÉ PIDE "APP KEY" Y "APP SECRET"?

**⚠️ ERROR EN EL FRONTEND (CORREGIDO):**

El frontend estaba mostrando campos incorrectos:
- ❌ "App Key" 
- ❌ "App Secret"

**Estos campos NO existen para AliExpress** porque no hay API oficial.

---

## ✅ **CAMPOS CORRECTOS (CORREGIDO):**

Ahora el sistema pide correctamente:
1. **Email / Username** → Tu email o username de AliExpress
2. **Password** → Tu contraseña de AliExpress
3. **2FA Habilitado** (opcional) → `true` si tienes autenticación de dos factores
4. **2FA Secret** (opcional) → Solo si tienes 2FA activado

---

## 🎯 **CÓMO CONFIGURAR:**

### **Paso 1: Obtener tus credenciales**
- **Email:** El email con el que te registraste en AliExpress
- **Password:** Tu contraseña de AliExpress
- **2FA:** Solo si tienes autenticación de dos factores activada

### **Paso 2: Configurar en el sistema**
1. Ve a **Settings → API Configuration**
2. Busca **"AliExpress Auto-Purchase"**
3. Ingresa:
   - **Email/Username:** `tu-email@ejemplo.com`
   - **Password:** `tu-contraseña`
   - **2FA Habilitado:** `false` (o `true` si lo tienes)
   - **2FA Secret:** (dejar vacío si no tienes 2FA)
4. Click **"Guardar"**

---

## ⚠️ **IMPORTANTE:**

### **Seguridad:**
- ✅ Las credenciales se guardan **encriptadas** con AES-256-GCM
- ✅ Solo tú puedes ver tus credenciales
- ✅ El sistema usa estas credenciales para automatizar compras

### **Limitaciones:**
- ⚠️ Si AliExpress detecta actividad automatizada, puede requerir CAPTCHA
- ⚠️ Si tienes 2FA, necesitarás proporcionar el secret TOTP
- ⚠️ El sistema respeta los límites de AliExpress para evitar bloqueos

---

## 🔄 **DIFERENCIA CON OTRAS APIs:**

| Marketplace | Tipo de Credenciales | Dónde Obtenerlas |
|------------|---------------------|------------------|
| **eBay** | App ID, Dev ID, Cert ID | Developer Portal (https://developer.ebay.com/) |
| **Amazon** | Client ID, Client Secret, Refresh Token | Seller Central → Developer Apps |
| **MercadoLibre** | Client ID, Client Secret | Developers Portal (https://developers.mercadolibre.com/) |
| **AliExpress** | ✅ **Email y Password** (cuenta normal) | Tu cuenta de AliExpress |

---

## 📝 **RESUMEN:**

**Para AliExpress:**
- ✅ Usa tu **email y contraseña NORMAL** de AliExpress
- ❌ NO necesitas registrarte como developer
- ❌ NO necesitas App Key o App Secret
- ✅ El sistema automatiza el navegador para hacer las compras

**El error que viste (App Key/App Secret) ya fue corregido.** Ahora el sistema pide los campos correctos: Email y Password.

