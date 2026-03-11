# Configuración de Amazon SP-API

**Última actualización:** 2025-02-28  
**Categoría:** Marketplace (Publicación)  
**Requisito:** Obligatorio para publicar productos en Amazon

La integración usa **Selling Partner API (SP-API)** con **Login with Amazon (LWA)** y firma **AWS Signature Version 4**.

---

## ¿Para qué se usa en Ivan Reseller?

- Publicar productos en Amazon desde oportunidades encontradas
- Gestionar listados (precios, stock, descripciones)
- Sincronizar ventas y comisiones
- Obtener datos de productos en Amazon

**Módulos:** `marketplace.service.ts`, `amazon.service.ts`, `publisher.routes.ts`, `APISettings.tsx`

---

## Parte 1: Completar el registro de desarrollador (developer.amazon.com)

Si estás en la pantalla **Amazon Developer Registration**:

1. **Developer details**
   - **Full legal name**: Debe coincidir con tu documento de identidad.
   - **Primary email**: Tu correo.
   - **Country**: País de tu cuenta de vendedor.

2. **This account identifies as a?**
   - **Sole Proprietorship** (persona física) o **Business** (empresa).
   - **Customer facing business name**: Nombre con el que verán tu app (ej: "Ivan Reseller").

3. **Individual address details**
   - **Address line 1** (y resto): Dirección física real; Amazon la usa para verificación y comunicaciones, no se muestra públicamente.

4. **City, Postal code, State, Customer support email, Phone**
   - Completa todos los campos obligatorios.
   - **Customer support email**: Puedes marcar "Same as primary email address".
   - **What are you most interested in?**: Si solo usas SP-API para vender, marca **Other/Unsure**.
   - Acepta los términos y haz clic en **Agree and Continue**.

5. **Verificación de identidad**
   - Ten a mano tu documento de identidad por si Amazon lo solicita.

Al terminar tendrás cuenta en Amazon Developer Console. Las credenciales SP-API se obtienen después en **Seller Central** y **AWS**, no en este formulario.

---

## Parte 2: Dónde se obtienen las credenciales SP-API

| Credencial | Dónde se obtiene |
|------------|-------------------|
| **LWA Client ID** y **LWA Client Secret** | Seller Central → Apps & Services → Develop Apps |
| **Refresh Token** | Autorizar la app con tu cuenta de vendedor (flujo OAuth) |
| **AWS Access Key ID** y **AWS Secret Access Key** | Usuario IAM en AWS Console (para firmar peticiones SP-API) |
| **Region** y **Marketplace ID** | Según tu marketplace (ej: US = `us-east-1` + `ATVPDKIKX0DER`) |

---

## Parte 3: Pasos después del registro

### Paso A: Crear la aplicación SP-API en Seller Central

1. Entra en [Seller Central](https://sellercentral.amazon.com/) con la cuenta con la que vendes.
2. Ve a **Apps y servicios** → **Desarrollar aplicaciones** (o **Apps & Services** → **Develop Apps**).
3. Crea una nueva app (ej: "Ivan Reseller").
4. Configura **Login with Amazon (LWA)** y asocia la app a **Selling Partner API**.
5. Anota **LWA Client ID** (formato `amzn1.application-oa2-client...`) y **LWA Client Secret** (formato `amzn1.oa2-cs.v1...`).
6. Configura una **Redirect URI** de OAuth (la de tu frontend o la que documente Amazon para self-authorization).

Docs: [Registering your application](https://developer-docs.amazon.com/sp-api/docs/registering-your-application), [Viewing your application information and credentials](https://developer-docs.amazon.com/sp-api/docs/viewing-your-application-information-and-credentials).

### Paso B: Obtener el Refresh Token

1. Sigue el flujo de **autorización** de la app con tu usuario vendedor.
2. Abre la URL de autorización en el navegador, inicia sesión como vendedor y autoriza la app.
3. Tras autorizar, serás redirigido a la Redirect URI con un `code` en la URL.
4. Intercambia ese `code` por un **Refresh Token** (LWA) según la documentación de Amazon (POST a `https://api.amazon.com/auth/o2/token` con `grant_type=authorization_code`).

El backend renueva automáticamente el Access Token (válido 1 h) usando el Refresh Token.

### Paso C: Crear usuario IAM en AWS

SP-API exige firmar las peticiones con **AWS SigV4**:

1. Entra en [AWS Console](https://console.aws.amazon.com/).
2. Ve a **IAM** → **Users** → **Add user**.
3. Nombre sugerido: `amazon-sp-api-user`; acceso: **Programmatic access**.
4. Asigna una política que permita llamar a SP-API (busca "Selling Partner API" en la documentación de Amazon).
5. Guarda **Access Key ID** y **Secret Access Key** (no se muestran de nuevo).

En el código se usan desde las credenciales guardadas o desde `AMAZON_ACCESS_KEY` / `AMAZON_SECRET_KEY` (o `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) en `.env`.

### Paso D: Seller ID y Marketplace ID

- **Seller ID**: En Seller Central (configuración de cuenta o URL); formato típico `A2XXXXXXXXXX`.
- **Marketplace ID**: Según el sitio, por ejemplo:
  - US: `ATVPDKIKX0DER`
  - Canada: `A2EUQ1WTGCTBG2`
  - México: `A1AM78C64UM0Y8`
  - Japan: `A1VC38T7YXB528`  

Lista: [SP-API marketplace IDs](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids).

---

## Parte 4: Configurar en Ivan Reseller

### Opción 1: Desde la UI (recomendada)

1. Inicia sesión en Ivan Reseller.
2. Ve a **Configuración** → **APIs** (`/api-settings`).
3. Localiza la tarjeta **Amazon SP-API**.
4. Completa:
   - **Client ID (LWA)**: LWA Client ID de la app.
   - **Client Secret**: LWA Client Secret.
   - **Refresh Token**: Obtenido en el Paso B.
   - **Region**: p. ej. `us-east-1`, `eu-west-1`, `ap-northeast-1`.
   - **Marketplace ID**: p. ej. `ATVPDKIKX0DER` para US.
   - **Seller ID**: (opcional) Tu Seller ID.
   - **AWS Access Key ID** y **AWS Secret Access Key**: Del Paso C (opcionales si ya están en `.env`).
5. Guarda y usa **Probar conexión**.

### Opción 2: Por API

Con el usuario autenticado:

```http
POST /api/amazon/credentials
Authorization: Bearer <tu_jwt>
Content-Type: application/json

{
  "clientId": "<LWA Client ID>",
  "clientSecret": "<LWA Client Secret>",
  "refreshToken": "<Refresh Token>",
  "region": "us-east-1",
  "marketplace": "ATVPDKIKX0DER"
}
```

Si no envías `awsAccessKeyId`/`awsSecretAccessKey` en el body, el backend usará `AMAZON_ACCESS_KEY` y `AMAZON_SECRET_KEY` (o `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) del `.env`.

Probar conexión:

```http
GET /api/amazon/test-connection
Authorization: Bearer <tu_jwt>
```

---

## Campos requeridos (resumen)

| Campo (UI) | Backend / .env | Requerido | Descripción |
|------------|----------------|-----------|-------------|
| Client ID (LWA) | `AMAZON_CLIENT_ID` | Sí | Client ID de Login with Amazon |
| Client Secret | `AMAZON_CLIENT_SECRET` | Sí | Client Secret de LWA |
| Refresh Token | `AMAZON_REFRESH_TOKEN` | Sí | Refresh Token OAuth |
| Region | `AMAZON_REGION` | Sí | Ej: `us-east-1`, `eu-west-1` |
| Marketplace ID | `AMAZON_MARKETPLACE_ID` | Sí | Ej: `ATVPDKIKX0DER` (US) |
| Seller ID | `AMAZON_SELLER_ID` | No | Formato `A2XXXXXXXXXX` |
| AWS Access Key ID | `AMAZON_ACCESS_KEY_ID` o `AMAZON_ACCESS_KEY` | Sí* | Para firma SigV4 |
| AWS Secret Access Key | `AMAZON_SECRET_ACCESS_KEY` o `AMAZON_SECRET_KEY` | Sí* | Para firma SigV4 |

\* Pueden ir en el body de credenciales o en variables de entorno.

**Ambientes:** Sandbox y Production; las credenciales se guardan por separado por ambiente.

---

## Cómo validar que quedó bien

- **En la UI:** Estado de la API en verde ("Sesión activa") y **Probar conexión** con mensaje de éxito.
- **Por API:** `GET /api/amazon/test-connection` debe devolver `success: true`.

---

## Errores típicos y soluciones

| Error | Causa | Solución |
|-------|--------|----------|
| Invalid Client ID | Client ID incorrecto o de otro tipo | Usar Client ID de tipo LWA; formato `amzn1.application-oa2-client...` |
| Invalid Refresh Token | Token expirado o inválido | Regenerar con el flujo OAuth; verificar ambiente (sandbox/production) |
| Region mismatch | Región no coincide con la cuenta | Usar la región de tu cuenta de vendedor |
| Missing AWS credentials | Firma SigV4 sin claves | Configurar AWS Access Key ID y Secret en la UI o en `.env` |

---

## Referencias

- [Amazon SP-API Developer Guide](https://developer-docs.amazon.com/sp-api/)
- [Connecting to the Selling Partner API](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api)
- [SP-API Endpoints](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints)
- [Marketplace IDs](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids)

---

## Notas técnicas

- Las credenciales se guardan en `api_credentials` (encriptadas con AES-256-GCM).
- Se usa `ENCRYPTION_KEY` del backend.
- El sistema renueva los Access Tokens con el Refresh Token al llamar a SP-API.
