# 🚀 GUÍA: Verificación y Despliegue OAuth - 2025-11-15

**Fecha**: 2025-11-15  
**Objetivo**: Verificar configuración de OAuth y desplegar correcciones  
**Estado**: ✅ **LISTO PARA DESPLEGAR**

---

## 📋 RESUMEN DE CAMBIOS IMPLEMENTADOS

### ✅ Correcciones Listas para Desplegar

1. **Error del Cache** - Corregido
   - `clearCredentialsCache` ahora se llama correctamente (sin `.catch()`)

2. **Validación de redirectUri** - Mejorada
   - Detecta URLs de `signin.sandbox.ebay.com`
   - Limpia prefijo `redirect_uri=`
   - Extrae RuName de parámetros `redirect_uri` o `runame`

3. **Logging del Callback OAuth** - Agregado
   - Logs detallados en cada paso del callback
   - Logs en `exchangeCodeForToken` con detalles completos
   - Validaciones de código vacío y errores

---

## 🔍 PASO 1: VERIFICAR REDIRECT URI EN EBAY DEVELOPER PORTAL

### ⚠️ IMPORTANTE: Entender la Diferencia

**Confusión común**:
- ❌ **NO** es la URL completa del callback
- ✅ **SÍ** es el **RuName** (Redirect URL Name) que eBay genera

**Flujo correcto**:
1. En eBay Developer Portal, registras la **URL completa**: 
   ```
   https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
   ```
2. eBay te da un **RuName** (ej: `Constanza_Santa-Constanz-ivanre-blbcfwx`)
3. Ese **RuName** es lo que guardas en el campo "Redirect URI (RuName)"

### 📝 Pasos para Verificar

#### 1. Acceder a eBay Developer Portal

**Sandbox**:
```
https://developer.ebay.com/my/keys
```

1. Selecciona el **Keyset: Sandbox**
2. Haz clic en **"User Tokens"**
3. Busca la sección **"Your eBay Sign-in Settings"**

#### 2. Verificar Redirect URL Name (RuName) Registrado

**Lo que debes ver**:
- Una lista de **Redirect URL Names (RuNames)** registrados
- Cada uno apunta a una URL completa

**Ejemplo**:
```
RuName: Constanza_Santa-Constanz-ivanre-blbcfwx
URL:    https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
```

#### 3. Verificar que la URL Coincida Exactamente

**URL que debe estar registrada**:
```
https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
```

**Verificaciones**:
- ✅ Debe empezar con `https://` (no `http://`)
- ✅ Debe ser `www.ivanreseller.com` (o tu dominio correcto)
- ✅ Debe terminar en `/api/marketplace-oauth/oauth/callback/ebay`
- ✅ NO debe tener espacios al inicio o final
- ✅ NO debe tener caracteres especiales codificados

#### 4. Copiar el RuName Exacto

**IMPORTANTE**:
- Copia el RuName **exactamente** como aparece en eBay
- No agregues espacios
- No modifiques mayúsculas/minúsculas
- No agregues prefijos como `redirect_uri=`

**Ejemplo correcto**:
```
Constanza_Santa-Constanz-ivanre-blbcfwx
```

**Ejemplos incorrectos**:
```
❌ redirect_uri=Constanza_Santa-Constanz-ivanre-blbcfwx
❌ Constanza_Santa-Constanz-ivanre-blbcfwx 
❌  Constanza_Santa-Constanz-ivanre-blbcfwx
❌ https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay
```

---

## 🔍 PASO 2: VERIFICAR CREDENCIALES EN EL SISTEMA

### Verificar en la Aplicación

1. **Acceder a Settings → API Settings**
2. **Buscar eBay (Sandbox)**
3. **Verificar campos**:
   - ✅ App ID: Debe empezar con `SBX-` para Sandbox
   - ✅ Dev ID: Debe estar completo
   - ✅ Cert ID: Debe estar completo
   - ✅ Redirect URI (RuName): Debe ser el RuName exacto (sin URL completa)

### Comparar con eBay Developer Portal

**App ID**:
- En eBay: Copia el App ID del Keyset Sandbox
- En Sistema: Debe coincidir **exactamente**

**Dev ID**:
- En eBay: Copia el Dev ID del Keyset Sandbox
- En Sistema: Debe coincidir **exactamente**

**Cert ID**:
- En eBay: Copia el Cert ID del Keyset Sandbox
- En Sistema: Debe coincidir **exactamente**

**Redirect URI (RuName)**:
- En eBay: Copia el RuName de "Your eBay Sign-in Settings"
- En Sistema: Debe coincidir **exactamente** (sin espacios, sin prefijos)

---

## 🚀 PASO 3: DESPLEGAR CÓDIGO CORREGIDO

### Opción A: Despliegue Automático (Railway)

Si tienes **auto-deploy** configurado:

1. **Hacer commit y push**:
   ```bash
   git add .
   git commit -m "fix: OAuth callback logging and redirectUri validation"
   git push origin main
   ```

2. **Railway detectará el push y desplegará automáticamente**

3. **Verificar despliegue**:
   - Ve a Railway Dashboard → `ivan-reseller-web` → **Deployments**
   - Espera a que el deployment termine (2-5 minutos)
   - Verifica que el estado sea **"Active"**

### Opción B: Despliegue Manual (Railway)

Si necesitas desplegar manualmente:

1. **Railway Dashboard** → `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en **"Redeploy"** (o el botón de deploy)
4. Esperar a que termine (2-5 minutos)

---

## 🔍 PASO 4: VERIFICAR LOGS DESPUÉS DEL DESPLIEGUE

### Acceder a Logs en Railway

1. **Railway Dashboard** → `ivan-reseller-web`
2. Click en **"Deployments"**
3. Click en el deployment más reciente
4. Click en **"View Logs"** o **"Logs"**

### Buscar Logs del Callback

**Buscar estos logs cuando se intente OAuth**:

```
[OAuth Callback] Received callback request
[OAuth Callback] State parsed successfully
[OAuth Callback] Processing eBay OAuth
[OAuth Callback] eBay credentials loaded
[OAuth Callback] Exchanging code for token
[EbayService] Exchanging authorization code for token
[EbayService] Token exchange successful
[OAuth Callback] Token exchange successful
[OAuth Callback] Saving credentials
[OAuth Callback] Credentials saved successfully
```

### Si Hay Errores

**Buscar estos logs de error**:

```
[OAuth Callback] Error processing OAuth callback
[EbayService] Token exchange failed
```

**Información que verás**:
- Error específico de eBay
- Código de error (ej: `unauthorized_client`, `invalid_grant`)
- `redirectUri` exacto que se está usando
- `redirectUriLength` para verificar longitud

---

## 🔍 PASO 5: PROBAR OAUTH NUEVAMENTE

### Pasos para Probar

1. **Ir a Settings → API Settings**
2. **Buscar eBay (Sandbox)**
3. **Verificar que las credenciales estén guardadas**:
   - App ID, Dev ID, Cert ID, Redirect URI (RuName)
4. **Click en botón "OAuth"**
5. **Completar OAuth en eBay**
6. **Revisar logs en Railway** para ver qué ocurre

### Qué Buscar en los Logs

**Si funciona correctamente**:
```
[OAuth Callback] Received callback request
[OAuth Callback] State parsed successfully
[OAuth Callback] Exchanging code for token
[EbayService] Token exchange successful
[OAuth Callback] Credentials saved successfully
```

**Si falla**:
```
[OAuth Callback] Error processing OAuth callback
error: "eBay OAuth error: unauthorized_client"
errorCode: "unauthorized_client"
redirectUriPreview: "Constanza_Santa-Constanz-ivanre-blbcfwx"
```

**Acción según error**:
- `unauthorized_client`: Verificar App ID y redirectUri
- `invalid_grant`: Código expirado o redirectUri no coincide
- `expired_token`: Código expirado, intentar nuevamente

---

## 📊 CHECKLIST DE VERIFICACIÓN

### Antes de Desplegar

- [ ] Código corregido está en el repositorio
- [ ] Cambios están commiteados
- [ ] No hay errores de linter

### Después de Desplegar

- [ ] Deployment completado en Railway
- [ ] Servicio está "Active"
- [ ] Logs se están generando correctamente

### Verificación de Credenciales

- [ ] App ID coincide con eBay Developer Portal
- [ ] Dev ID coincide con eBay Developer Portal
- [ ] Cert ID coincide con eBay Developer Portal
- [ ] Redirect URI (RuName) coincide exactamente (sin espacios, sin prefijos)

### Verificación de OAuth

- [ ] OAuth se completa exitosamente en eBay
- [ ] Callback se está llamando (ver logs)
- [ ] Token se intercambia correctamente (ver logs)
- [ ] Credenciales se guardan (ver logs)
- [ ] UI muestra que OAuth está completo

---

## 🎯 RESULTADO ESPERADO

Después de seguir estos pasos:

1. ✅ El código corregido estará desplegado
2. ✅ Los logs mostrarán exactamente qué ocurre en el callback
3. ✅ Podremos diagnosticar por qué el token no se guarda (si persiste el problema)
4. ✅ El redirectUri se validará y limpiará correctamente

---

## 📝 NOTAS IMPORTANTES

### Sobre el RedirectUri

**IMPORTANTE**: 
- El campo "Redirect URI (RuName)" en el sistema debe contener **SOLO el RuName**
- **NO** debe contener la URL completa del callback
- **NO** debe tener prefijos como `redirect_uri=`
- Debe coincidir **exactamente** con el RuName en eBay Developer Portal

### Sobre el Callback URL

**La URL completa del callback** (`https://www.ivanreseller.com/api/marketplace-oauth/oauth/callback/ebay`) debe estar registrada en eBay Developer Portal, pero **NO** se guarda en las credenciales. Solo se guarda el **RuName** que eBay genera.

---

**Fecha de creación**: 2025-11-15  
**Estado**: ✅ **LISTO PARA USAR**  
**Próximo paso**: **Desplegar y probar OAuth**

