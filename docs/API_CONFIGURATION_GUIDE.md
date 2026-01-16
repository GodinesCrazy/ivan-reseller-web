# 📖 GUÍA PASO A PASO: CONFIGURACIÓN DE APIs FALTANTES

**Fecha:** 2025-01-26  
**Versión:** v1.0.0  
**Audiencia:** Usuario/Admin sin experiencia técnica

---

## 🎯 OBJETIVO

Esta guía te ayudará a obtener y configurar las APIs faltantes para que el sistema quede 100% funcional.

---

## 🔴 PRIORIDAD 1: AliExpress Affiliate API (CRÍTICO)

### ¿Para qué sirve?
- Buscar productos en AliExpress
- Extraer precios, imágenes y descripciones
- Encontrar oportunidades de negocio
- **Sin esta API, el sistema NO puede buscar productos**

### ¿Dónde se obtiene?
1. Ir a: https://open.aliexpress.com/
2. Iniciar sesión con tu cuenta de AliExpress
3. Ir a "My Apps" → "Create App"
4. Seleccionar tipo: "Affiliate API"
5. Completar información de la app

### ¿Qué datos exactos copiar?
Después de crear la app, verás:
- **App Key:** Un número (ejemplo: `12345678`)
- **App Secret:** Una cadena larga (ejemplo: `a1b2c3d4e5f6...`)
- **Tracking ID:** Opcional (ya tienes: `ivanreseller_web`)

### ¿Dónde configurarlo en el sistema?
1. Ir a: `https://www.ivanreseller.com/api-settings`
2. Buscar la tarjeta "AliExpress Affiliate API"
3. Hacer clic en "Editar" o "Configurar"
4. Llenar los campos:
   - **App Key:** [Pegar el App Key]
   - **App Secret:** [Pegar el App Secret]
   - **Tracking ID:** `ivanreseller_web` (ya lo tienes)
   - **Sandbox:** `false` (para producción)
5. Hacer clic en "Guardar"

### ¿Cómo validar que quedó correcta?
- ✅ La tarjeta muestra "✅ Configurado"
- ✅ Estado cambia a "Available" o "Healthy"
- ✅ Puedes hacer clic en "Probar conexión" (si está disponible)
- ✅ Al ir a "Oportunidades" y buscar, encuentra productos

---

## 🔴 PRIORIDAD 1: Actualizar Callback URL de AliExpress Dropshipping

### ¿Para qué sirve?
- Permite que el OAuth de AliExpress funcione correctamente
- Sin esto, el botón "Autorizar OAuth" no funciona

### ¿Dónde actualizarlo?
1. Ir a: https://open.aliexpress.com/
2. Iniciar sesión
3. Ir a "My Apps"
4. Buscar tu app de "Dropshipping API"
5. Hacer clic en "Edit" o "Configurar"
6. Buscar "Callback URL" o "Redirect URI"
7. Cambiar de: `https://ivanreseller.com/aliexpress/callback`
8. A: `https://www.ivanreseller.com/api/aliexpress/callback`
9. Guardar cambios

### ¿Cómo validar que quedó correcta?
- ✅ El OAuth funciona (botón "Autorizar OAuth" completa el flujo)
- ✅ No hay error "invalid_redirect_uri"
- ✅ Tokens se guardan correctamente

---

## 🟡 PRIORIDAD 2: MercadoLibre API

### ¿Para qué sirve?
- Publicar productos en MercadoLibre
- Gestionar inventario en MercadoLibre
- Recibir notificaciones de ventas

### ¿Dónde se obtiene?
1. Ir a: https://developers.mercadolibre.com/
2. Iniciar sesión con tu cuenta de MercadoLibre
3. Ir a "Mis aplicaciones" → "Crear nueva aplicación"
4. Completar información:
   - Nombre: "Ivan Reseller"
   - Redirect URI: `https://www.ivanreseller.com/auth/callback` (o similar)
5. Después de crear, verás:
   - **Client ID (App ID):** Un número largo
   - **Client Secret:** Una cadena secreta

### ¿Qué datos exactos copiar?
- **Client ID:** [El número que aparece como "App ID"]
- **Client Secret:** [La cadena secreta]

### ¿Dónde configurarlo en el sistema?
1. Ir a: `https://www.ivanreseller.com/api-settings`
2. Buscar la tarjeta "MercadoLibre API"
3. Hacer clic en "Editar" o "Configurar"
4. Llenar los campos:
   - **Client ID:** [Pegar el Client ID]
   - **Client Secret:** [Pegar el Client Secret]
   - **Redirect URI:** `https://www.ivanreseller.com/auth/callback` (o dejar vacío)
5. Hacer clic en "Guardar"
6. **IMPORTANTE:** Después de guardar, hacer clic en "OAuth" para autorizar

### ¿Cómo validar que quedó correcta?
- ✅ La tarjeta muestra "✅ Configurado"
- ✅ Estado cambia a "Available"
- ✅ Puedes hacer clic en "OAuth" y completar el flujo
- ✅ Al publicar un producto, puedes seleccionar MercadoLibre como destino

---

## 🟡 PRIORIDAD 2: Amazon SP-API

### ¿Para qué sirve?
- Publicar productos en Amazon
- Gestionar inventario en Amazon
- Recibir notificaciones de ventas

### ¿Dónde se obtiene?
**Proceso más complejo, requiere varios pasos:**

#### Paso 1: Crear App en Amazon Developer
1. Ir a: https://developer.amazon.com/
2. Iniciar sesión con tu cuenta de Amazon Seller
3. Ir a "Apps & Services" → "Develop Apps"
4. Crear nueva app tipo "Seller Partner API"
5. Obtener:
   - **Client ID (LWA):** `amzn1.application-oa2-client.xxxxx`
   - **Client Secret:** `amzn1.oa2-cs.v1.xxxxx`

#### Paso 2: Obtener Refresh Token
1. Usar el OAuth flow de Amazon
2. Obtener **Refresh Token:** `Atzr|IwEB...`

#### Paso 3: Crear AWS IAM User
1. Ir a: https://console.aws.amazon.com/iam/
2. Crear nuevo usuario IAM
3. Asignar permisos para SP-API
4. Obtener:
   - **AWS Access Key ID:** `AKIAXXXXXXXXXXXXXXXX`
   - **AWS Secret Access Key:** [Cadena secreta]

#### Paso 4: Obtener Marketplace ID
1. Ir a: https://developer-docs.amazon.com/sp-api/docs/marketplace-ids
2. Seleccionar tu región (ej: US = `ATVPDKIKX0DER`)

### ¿Qué datos exactos copiar?
- **Client ID (LWA):** `amzn1.application-oa2-client.xxxxx`
- **Client Secret:** `amzn1.oa2-cs.v1.xxxxx`
- **Refresh Token:** `Atzr|IwEB...`
- **AWS Access Key ID:** `AKIAXXXXXXXXXXXXXXXX`
- **AWS Secret Access Key:** [Cadena secreta]
- **Region:** `us-east-1` (o tu región)
- **Marketplace ID:** `ATVPDKIKX0DER` (o el de tu región)

### ¿Dónde configurarlo en el sistema?
1. Ir a: `https://www.ivanreseller.com/api-settings`
2. Buscar la tarjeta "Amazon SP-API"
3. Hacer clic en "Editar" o "Configurar"
4. Llenar los 7 campos:
   - **Client ID (LWA):** [Pegar]
   - **Client Secret:** [Pegar]
   - **Refresh Token:** [Pegar]
   - **Region:** [Pegar, ej: `us-east-1`]
   - **Marketplace ID:** [Pegar, ej: `ATVPDKIKX0DER`]
   - **AWS Access Key ID:** [Pegar]
   - **AWS Secret Access Key:** [Pegar]
5. Hacer clic en "Guardar"

### ¿Cómo validar que quedó correcta?
- ✅ La tarjeta muestra "✅ Configurado"
- ✅ Estado cambia a "Available"
- ✅ Al publicar un producto, puedes seleccionar Amazon como destino

**Nota:** Amazon SP-API es más compleja de configurar. Si tienes problemas, puedes dejarla para después y usar solo eBay y MercadoLibre.

---

## 🟢 PRIORIDAD 3: 2Captcha API (Opcional)

### ¿Para qué sirve?
- Resolver captchas automáticamente
- Útil cuando el sistema encuentra captchas en sitios web

### ¿Dónde se obtiene?
1. Ir a: https://2captcha.com/
2. Crear cuenta
3. Ir a "Settings" → "API Key"
4. Copiar tu **API Key**

### ¿Qué datos exactos copiar?
- **API Key:** [Cadena de texto]

### ¿Dónde configurarlo en el sistema?
1. Ir a: `https://www.ivanreseller.com/api-settings`
2. Buscar la tarjeta "2Captcha API"
3. Hacer clic en "Editar" o "Configurar"
4. Llenar el campo:
   - **API Key:** [Pegar el API Key]
5. Hacer clic en "Guardar"

### ¿Cómo validar que quedó correcta?
- ✅ La tarjeta muestra "✅ Configurado"
- ✅ Estado cambia a "Available"

---

## 📋 ORDEN RECOMENDADO DE CONFIGURACIÓN

### Fase 1: Sistema Básico Funcional (OBLIGATORIO)
1. ✅ **AliExpress Affiliate API** - Obtener App Key y App Secret
2. ✅ **Actualizar Callback URL** de AliExpress Dropshipping

**Resultado:** Sistema puede buscar productos y encontrar oportunidades.

### Fase 2: Publicación en Marketplaces (IMPORTANTE)
3. ✅ **MercadoLibre API** - Para publicar en MercadoLibre
4. ⚠️ **Amazon SP-API** - Para publicar en Amazon (opcional, más complejo)

**Resultado:** Sistema puede publicar productos en marketplaces.

### Fase 3: Mejoras Opcionales
5. ✅ **2Captcha API** - Para resolver captchas automáticamente

**Resultado:** Sistema más robusto ante captchas.

---

## ✅ VALIDACIÓN FINAL

### Después de configurar AliExpress Affiliate API:
- ✅ Ir a "Oportunidades"
- ✅ Hacer una búsqueda (ej: "wireless headphones")
- ✅ Debe mostrar resultados de productos
- ✅ Debe mostrar precios, imágenes y descripciones

### Después de configurar MercadoLibre:
- ✅ Ir a "Productos"
- ✅ Seleccionar un producto
- ✅ Hacer clic en "Publicar"
- ✅ Debe aparecer MercadoLibre como opción
- ✅ Debe permitir publicar en MercadoLibre

### Después de actualizar Callback URL:
- ✅ Ir a "API Settings"
- ✅ Buscar "AliExpress Dropshipping API"
- ✅ Hacer clic en "Autorizar OAuth"
- ✅ Debe completar el flujo sin errores
- ✅ Debe mostrar "✅ Conectado" o "Paso 2/2 completado"

---

## 🎯 CUÁNDO EL SOFTWARE QUEDARÁ 100% FUNCIONAL

### Mínimo Funcional (Búsqueda de Productos)
**Requiere:**
- ✅ AliExpress Affiliate API (App Key + App Secret)
- ✅ AliExpress Dropshipping API (Callback URL actualizado)

**Funcionalidad disponible:**
- ✅ Buscar productos en AliExpress
- ✅ Ver oportunidades de negocio
- ✅ Ver precios y márgenes
- ✅ OAuth de AliExpress funciona

### Funcionalidad Completa (Búsqueda + Publicación)
**Requiere (además de lo anterior):**
- ✅ Al menos un marketplace configurado (eBay, MercadoLibre, o Amazon)

**Funcionalidad disponible:**
- ✅ Todo lo anterior +
- ✅ Publicar productos en marketplaces
- ✅ Gestionar inventario
- ✅ Recibir notificaciones de ventas

### Funcionalidad Avanzada
**Requiere (además de lo anterior):**
- ✅ 2Captcha API (opcional)
- ✅ PayPal Payouts (ya configurado)
- ✅ GROQ AI (ya configurado)

**Funcionalidad disponible:**
- ✅ Todo lo anterior +
- ✅ Resolución automática de captchas
- ✅ Pagos automáticos de comisiones
- ✅ Generación de títulos con IA

---

## 📝 CHECKLIST FINAL PARA SISTEMA 100% OPERATIVO

### APIs Obligatorias
- [ ] AliExpress Affiliate API: App Key configurado
- [ ] AliExpress Affiliate API: App Secret configurado
- [ ] AliExpress Dropshipping: Callback URL actualizado a `https://www.ivanreseller.com/api/aliexpress/callback`

### APIs Importantes (Al menos una)
- [ ] eBay Trading API: OAuth completado (ya tienes credenciales)
- [ ] MercadoLibre API: Configurado y OAuth completado
- [ ] Amazon SP-API: Configurado (opcional, más complejo)

### Validación
- [ ] Búsqueda de productos funciona (Oportunidades → Buscar)
- [ ] OAuth de AliExpress funciona (API Settings → Autorizar)
- [ ] Publicación en marketplace funciona (Productos → Publicar)
- [ ] Dashboard carga correctamente
- [ ] No hay errores 502 en consola

---

## 🚨 SEÑALES DE ÉXITO vs ERROR

### ✅ Señales de Éxito
- Tarjeta de API muestra "✅ Configurado"
- Estado muestra "Available" o "Healthy"
- Búsqueda de productos devuelve resultados
- OAuth completa sin errores
- Publicación de productos funciona

### ❌ Señales de Error (Requieren Acción)
- Error "API Key inválido" → Verificar que copiaste correctamente
- Error "invalid_redirect_uri" → Verificar Callback URL
- Error 401/403 → Verificar credenciales
- Error 502 → Verificar que Railway backend está activo
- Búsqueda no devuelve resultados → Verificar AliExpress Affiliate API

### ⚠️ Errores Normales (No Requieren Acción)
- "Setup incompleto" → Configurar APIs faltantes (comportamiento esperado)
- Lista vacía si no hay productos → Normal si no has importado productos aún

---

## 📞 SOPORTE

Si encuentras problemas:
1. Revisar `docs/API_CONFIGURATION_DIAGNOSIS.md` para diagnóstico
2. Verificar que copiaste las credenciales correctamente
3. Verificar que no hay espacios extra al inicio/final
4. Ejecutar `npm run smoke:prod` para diagnóstico técnico

---

**Fecha de creación:** 2025-01-26  
**Versión:** v1.0.0

