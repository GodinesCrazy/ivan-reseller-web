# 📚 Guía Completa: Cómo Obtener APIs de Amazon y MercadoLibre

## 🎯 Resumen

Esta guía te ayudará a obtener y configurar las credenciales necesarias para usar las APIs de **Amazon SP-API** y **MercadoLibre** en el sistema Ivan Reseller.

---

## 📦 AMAZON SP-API (Selling Partner API)

### ¿Qué necesitas?

Amazon SP-API requiere múltiples credenciales porque usa autenticación OAuth 2.0 + AWS Signature V4:

1. **Seller ID** - Tu ID de vendedor en Amazon
2. **LWA Client ID** - ID de aplicación OAuth
3. **LWA Client Secret** - Secret de aplicación OAuth
4. **LWA Refresh Token** - Token de refresco OAuth
5. **AWS Access Key ID** - Para firmar requests
6. **AWS Secret Access Key** - Para firmar requests
7. **Region** - Región de AWS (ej: `us-east-1`)
8. **Marketplace ID** - ID del marketplace (ej: `ATVPDKIKX0DER` para US)

### 📋 Pasos para Obtenerlas

#### Paso 1: Crear una Aplicación en Amazon Developer

1. Ve a [Amazon Developer Central](https://developer.amazon.com/)
2. Inicia sesión con tu cuenta de vendedor de Amazon
3. Ve a **"Apps & Services"** → **"Develop Apps"**
4. Haz clic en **"Create a new app"**
5. Completa:
   - **App name**: Nombre de tu aplicación (ej: "Ivan Reseller")
   - **OAuth redirect URI**: `https://tu-dominio.com/api/marketplace/oauth/callback/amazon`
   - **API**: Selecciona **"Selling Partner API"**
6. Guarda el **Client ID** y **Client Secret** (LWA credentials)

#### Paso 2: Obtener el Refresh Token

1. En la misma página de la aplicación, busca **"Authorize"** o **"OAuth"**
2. Copia la **Authorization URL** que se genera
3. Abre esa URL en tu navegador
4. Autoriza la aplicación con tu cuenta de vendedor
5. Serás redirigido a tu redirect URI con un `code` en la URL
6. Intercambia ese `code` por un **Refresh Token** usando la API de Amazon

**Nota**: El sistema tiene un endpoint para hacer esto automáticamente. Puedes usar:
```
GET /api/marketplace/oauth/authorize/amazon?userId=TU_USER_ID&environment=production
```

#### Paso 3: Crear Usuario IAM en AWS

1. Ve a [AWS Console](https://console.aws.amazon.com/)
2. Ve a **IAM** → **Users** → **Add users**
3. Crea un usuario con:
   - **User name**: `amazon-sp-api-user`
   - **Access type**: **Programmatic access**
4. Asigna la política: **`SellingPartnerAPI`** (o crea una política personalizada)
5. Guarda el **Access Key ID** y **Secret Access Key**

#### Paso 4: Obtener Seller ID y Marketplace ID

1. **Seller ID**: 
   - Ve a tu cuenta de vendedor en Amazon Seller Central
   - El Seller ID está en la URL o en la configuración de cuenta
   - Formato: `A2XXXXXXXXXX`

2. **Marketplace ID**:
   - **US**: `ATVPDKIKX0DER`
   - **Canada**: `A2EUQ1WTGCTBG2`
   - **UK**: `A1F83G8C2ARO7P`
   - **Germany**: `A1PA6795UKMFR9`
   - **France**: `A13V1IB3VIYZZH`
   - **Italy**: `APJ6JRA9NG5V4`
   - **Spain**: `A1RKKUPIHCS9HS`
   - **Japan**: `A1VC38T7YXB528`
   - **India**: `A21TJRUUN4KGV`

#### Paso 5: Configurar en el Sistema

1. Ve a **API Settings** en el sistema
2. Selecciona **Amazon SP-API**
3. Completa todos los campos:
   - **Seller ID**: Tu Seller ID
   - **Client ID**: LWA Client ID
   - **Client Secret**: LWA Client Secret
   - **Refresh Token**: LWA Refresh Token
   - **AWS Access Key ID**: Tu AWS Access Key
   - **AWS Secret Access Key**: Tu AWS Secret Key
   - **Region**: `us-east-1` (o la región correspondiente)
   - **Marketplace ID**: `ATVPDKIKX0DER` (o el de tu país)

### 🔗 Enlaces Útiles

- [Documentación Oficial Amazon SP-API](https://developer-docs.amazon.com/sp-api/)
- [Guía de Autorización](https://developer-docs.amazon.com/sp-api/docs/self-authorization)
- [Marketplace IDs](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids)

---

## 💛 MERCADOLIBRE API

### ¿Qué necesitas?

MercadoLibre usa OAuth 2.0, necesitas:

1. **Client ID** (App ID) - ID de tu aplicación
2. **Client Secret** - Secret de tu aplicación
3. **Access Token** - Token de acceso (se obtiene después de OAuth)
4. **Refresh Token** - Token de refresco (se obtiene después de OAuth)
5. **User ID** (opcional) - ID del usuario vendedor

### 📋 Pasos para Obtenerlas

#### Paso 1: Crear una Aplicación en MercadoLibre

1. Ve a [MercadoLibre Developers](https://developers.mercadolibre.com/)
2. Inicia sesión con tu cuenta de MercadoLibre
3. Ve a **"Mis aplicaciones"** → **"Crear nueva aplicación"**
4. Completa:
   - **Nombre**: Nombre de tu aplicación (ej: "Ivan Reseller")
   - **Redirect URI**: `https://tu-dominio.com/api/marketplace/oauth/callback/mercadolibre`
   - **Tipo**: Selecciona **"Marketplace"** o **"Dropshipping"**
5. Guarda el **App ID (Client ID)** y **Secret Key (Client Secret)**

#### Paso 2: Obtener Access Token y Refresh Token

**Opción A: Usando el Sistema (Recomendado)**

1. Ve a **API Settings** en el sistema
2. Selecciona **MercadoLibre**
3. Ingresa tu **Client ID** y **Client Secret**
4. Haz clic en **"Autorizar con MercadoLibre"** o **"OAuth"**
5. Serás redirigido a MercadoLibre para autorizar
6. Después de autorizar, el sistema obtendrá automáticamente los tokens

**Opción B: Manualmente**

1. Construye la URL de autorización:
```
https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=TU_CLIENT_ID&redirect_uri=TU_REDIRECT_URI
```

2. Abre esa URL en tu navegador
3. Autoriza la aplicación
4. Serás redirigido con un `code` en la URL
5. Intercambia el `code` por tokens usando:
```
POST https://api.mercadolibre.com/oauth/token
{
  "grant_type": "authorization_code",
  "client_id": "TU_CLIENT_ID",
  "client_secret": "TU_CLIENT_SECRET",
  "code": "EL_CODE_DE_LA_URL",
  "redirect_uri": "TU_REDIRECT_URI"
}
```

6. La respuesta incluirá:
   - `access_token`: Tu Access Token
   - `refresh_token`: Tu Refresh Token
   - `user_id`: Tu User ID

#### Paso 3: Configurar en el Sistema

1. Ve a **API Settings** en el sistema
2. Selecciona **MercadoLibre**
3. Completa:
   - **Client ID**: Tu App ID
   - **Client Secret**: Tu Secret Key
   - **Access Token**: El access token obtenido
   - **Refresh Token**: El refresh token obtenido
   - **User ID**: (Opcional) Tu User ID

### 🔄 Renovar Tokens

Los tokens de MercadoLibre expiran. El sistema los renueva automáticamente usando el Refresh Token, pero puedes renovarlos manualmente:

```
POST https://api.mercadolibre.com/oauth/token
{
  "grant_type": "refresh_token",
  "client_id": "TU_CLIENT_ID",
  "client_secret": "TU_CLIENT_SECRET",
  "refresh_token": "TU_REFRESH_TOKEN"
}
```

### 🔗 Enlaces Útiles

- [Documentación Oficial MercadoLibre](https://developers.mercadolibre.com.ar/)
- [Guía de Autenticación](https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion)
- [OAuth 2.0 Flow](https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion#oauth-2.0)

---

## 🛠️ Configuración en el Sistema

### Dónde Configurar

1. **Frontend**: Ve a `https://www.ivanreseller.com/api-settings`
2. Busca las secciones de **Amazon SP-API** y **MercadoLibre**
3. Completa todos los campos requeridos
4. Haz clic en **"Guardar"** o **"Save"**

### Ambientes (Sandbox vs Production)

Ambas APIs soportan ambientes:

- **Sandbox**: Para pruebas (no afecta datos reales)
- **Production**: Para uso real

Puedes configurar ambos ambientes en el sistema.

### Verificar Configuración

Después de configurar, el sistema verificará automáticamente:

1. Si las credenciales son válidas
2. Si puedes hacer requests a la API
3. El estado de la conexión

Verás el estado en la página de **API Settings**:
- ✅ **Verde**: Configurado y funcionando
- ⚠️ **Amarillo**: Configurado pero con advertencias
- ❌ **Rojo**: Error en la configuración

---

## ⚠️ Consideraciones Importantes

### Amazon SP-API

- **Costo**: Gratis, pero Amazon puede tener límites de rate
- **Aprobación**: Puede tomar varios días obtener aprobación para ciertas APIs
- **Regiones**: Asegúrate de usar la región correcta para tu marketplace
- **Seguridad**: Nunca compartas tus credenciales AWS

### MercadoLibre

- **Costo**: Gratis para uso básico
- **Límites**: Hay límites de requests por minuto
- **Tokens**: Los tokens expiran, el sistema los renueva automáticamente
- **Países**: Cada país tiene su propia API (MLM, MLA, MLB, etc.)

---

## 🆘 Solución de Problemas

### Amazon SP-API

**Error: "Invalid credentials"**
- Verifica que todos los campos estén completos
- Asegúrate de que el Refresh Token sea válido
- Verifica que las credenciales AWS sean correctas

**Error: "Marketplace not found"**
- Verifica que el Marketplace ID sea correcto para tu región
- Asegúrate de que tu cuenta de vendedor tenga acceso a ese marketplace

### MercadoLibre

**Error: "Invalid access token"**
- El token puede haber expirado, renueva usando el Refresh Token
- Verifica que el Client ID y Secret sean correctos

**Error: "OAuth authorization failed"**
- Verifica que el Redirect URI coincida exactamente
- Asegúrate de que la aplicación esté activa en MercadoLibre

---

## 📞 Soporte

Si tienes problemas:

1. Revisa los logs del sistema en **System Logs**
2. Verifica el estado de las APIs en **API Settings**
3. Consulta la documentación oficial de cada API
4. Contacta al soporte técnico si persisten los problemas

---

**Última actualización**: Noviembre 2025

