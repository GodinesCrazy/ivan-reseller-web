# 🔐 Guía Completa: Configuración OAuth de eBay

Esta guía explica cómo completar el proceso de autorización OAuth para eBay después de configurar las credenciales base.

---

## 📋 Requisitos Previos

✅ **Credenciales base configuradas:**
- App ID (Client ID)
- Dev ID
- Cert ID (Client Secret)
- Redirect URI (RuName)

---

## 🚀 Proceso de Autorización OAuth

### Opción 1: Usar la Interfaz Web (Recomendado)

1. **Ir a Settings → API Settings → eBay**
2. **Seleccionar el ambiente** (Sandbox o Production)
3. **Hacer clic en el botón "OAuth"**
4. **Autorizar la aplicación** en la página de eBay
5. **Esperar la redirección** automática de vuelta al sistema

El sistema manejará automáticamente:
- El intercambio del código de autorización por tokens
- El guardado de los tokens OAuth en la base de datos
- La activación de la API para ese ambiente

---

### Opción 2: Usar URL de Autorización Directa

Si tienes la URL de autorización generada por eBay o por el sistema:

#### Paso 1: Abrir la URL de Autorización

```bash
# Ejemplo de URL de producción:
https://auth.ebay.com/oauth2/authorize?client_id=IvanMart-IVANRese-PRD-febbdcd65-626be473&response_type=code&redirect_uri=Ivan_Marty-IvanMart-IVANRe-cgcqu&scope=...
```

**⚠️ IMPORTANTE:** 
- La URL debe incluir el parámetro `state` con información del usuario y ambiente
- Para usar la URL directa, asegúrate de que el `redirect_uri` coincida exactamente con el configurado en eBay Developer Portal

#### Paso 2: Autorizar la Aplicación

1. Inicia sesión en tu cuenta de eBay
2. Revisa los permisos solicitados (scopes)
3. Haz clic en **"Authorize"** o **"Aceptar"**

#### Paso 3: Redirección Automática

eBay redirigirá automáticamente a:
```
https://tu-dominio.com/api/marketplace-oauth/oauth/callback/ebay?code=AUTHORIZATION_CODE&state=STATE_VALUE
```

El sistema procesará automáticamente:
- ✅ Validación del código de autorización
- ✅ Intercambio por access token y refresh token
- ✅ Guardado seguro de los tokens
- ✅ Activación de la API

---

## 🔍 Verificación Post-OAuth

### 1. Verificar en la Interfaz Web

- **Settings → API Settings → eBay**
- Debe mostrar estado: ✅ **"Configurado"** o **"Autorizado"**
- El botón "OAuth" debe indicar que ya está autorizado

### 2. Ejecutar Test de Conexión

```bash
# Desde el backend
cd backend
npm run test-apis 1
```

**Resultado esperado:**
```
✅ ebay (production): API configurada y autorizada
```

### 3. Verificar en los Logs

Busca en los logs del backend:
```
[OAuth Callback] Token exchange successful
[OAuth Callback] Credentials saved successfully
```

---

## ⚠️ Solución de Problemas

### Error: "unauthorized_client"

**Causa:** El Redirect URI no coincide exactamente con el configurado en eBay Developer Portal.

**Solución:**
1. Verifica el RuName en: https://developer.ebay.com/my/keys
2. Asegúrate de que el Redirect URI en `APIS.txt` coincide exactamente
3. No uses URLs completas, solo el RuName (ej: `Ivan_Marty-IvanMart-IVANRe-cgcqu`)

### Error: "invalid_grant"

**Causa:** El código de autorización expiró o fue usado previamente.

**Solución:**
1. Genera una nueva URL de autorización
2. Vuelve a iniciar el flujo OAuth

### Error: "Missing eBay base credentials"

**Causa:** Las credenciales base (App ID, Dev ID, Cert ID) no están configuradas.

**Solución:**
1. Configura primero las credenciales base usando `npm run configure-apis`
2. Luego completa el OAuth

### Token Expirado

**Causa:** Los tokens OAuth tienen un tiempo de vida limitado.

**Solución:**
- El sistema debería renovar automáticamente usando el refresh token
- Si falla, simplemente vuelve a autorizar desde Settings → API Settings → eBay

---

## 🔐 Scopes (Permisos) Incluidos

La URL de autorización incluye los siguientes scopes para funcionalidad completa:

- `https://api.ebay.com/oauth/api_scope` - Acceso básico
- `sell.inventory` - Gestión de inventario
- `sell.marketing` - Marketing y promociones
- `sell.fulfillment` - Cumplimiento de órdenes
- `sell.account` - Información de cuenta
- `sell.analytics` - Analytics y reportes
- `sell.finances` - Información financiera
- `sell.payment.dispute` - Disputas de pago
- Y más...

---

## 📝 Notas Importantes

1. **Ambientes Separados:** 
   - Sandbox y Production requieren autorización OAuth independiente
   - Cada ambiente tiene su propio Redirect URI (RuName)

2. **Seguridad:**
   - Los tokens OAuth se almacenan encriptados en la base de datos
   - El sistema maneja automáticamente la renovación de tokens

3. **Multi-Tenant:**
   - Cada usuario tiene sus propias credenciales y tokens OAuth
   - No se comparten tokens entre usuarios

---

## 🎯 Próximos Pasos Después de OAuth

Una vez completado el OAuth:

1. ✅ **Verificar conexión:** Ejecuta `npm run test-apis`
2. ✅ **Publicar productos:** Las publicaciones a eBay ahora funcionarán
3. ✅ **Gestionar inventario:** Podrás actualizar precios y stock
4. ✅ **Procesar órdenes:** El sistema podrá sincronizar ventas automáticamente

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs del backend
2. Verifica que las credenciales base estén correctas
3. Asegúrate de que el Redirect URI coincida exactamente
4. Contacta al equipo de desarrollo si el problema persiste

---

**Última actualización:** 2025-01-26

