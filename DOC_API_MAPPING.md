# 📋 MAPEO: APIS.txt → Variables de Entorno / Base de Datos

**Fecha**: 2025-01-28  
**Fuente**: `APIS.txt`  
**Destino**: Variables de entorno (`.env`) y Base de datos (`ApiCredential`)

---

## 🔍 ESTRUCTURA DE APIS.txt

El archivo `APIS.txt` tiene el siguiente formato:

```
# IVAN_RESELLER API KEYS

# AI Provider
groq : gsk_...

eBay (SandBox)
App ID (Client ID) IvanMart-IVANRese-SBX-...
Dev ID 951dd02a-...
Cert ID (Client Secret) SBX-...
Redirect URI (RuName) Ivan_Marty-...

eBay producción
App ID (Client ID) IvanMart-IVANRese-PRD-...
Dev ID 951dd02a-...
Cert ID (Client Secret) PRD-...

OpenAI
sk-proj-...

Gemini AI : AIzaSy...

ScraperAPI Key : dcf6700...

ZenRows API: 4aec1ce...

brightdata: b00c69f...

PayPal
client ID AYH1Okx...
secret Key EKjZYTF...

GEMINI_API_KEY AIzaSyBo...

SENDGRID_API_KEY SWD2C5P... ( Twilio )

STRIPE_SECRET_KEY pk_test_...
STRIPE_WEBHOOK_SECRET sk_test_...

Exchange API Key 0895d456...
```

---

## 📊 TABLA DE MAPEO

| Clave en APIS.txt | Proveedor | Entorno | Variable de Entorno | Campo en BD | Notas |
|-------------------|-----------|---------|---------------------|-------------|-------|
| `groq : gsk_...` | Groq | - | `GROQ_API_KEY` | `groq.apiKey` | AI Provider |
| `eBay (SandBox)` → `App ID` | eBay | sandbox | `EBAY_SANDBOX_APP_ID` o `EBAY_APP_ID` | `ebay.appId` | Legacy: `EBAY_APP_ID` |
| `eBay (SandBox)` → `Dev ID` | eBay | sandbox | `EBAY_SANDBOX_DEV_ID` o `EBAY_DEV_ID` | `ebay.devId` | Legacy: `EBAY_DEV_ID` |
| `eBay (SandBox)` → `Cert ID` | eBay | sandbox | `EBAY_SANDBOX_CERT_ID` o `EBAY_CERT_ID` | `ebay.certId` | Legacy: `EBAY_CERT_ID` |
| `eBay (SandBox)` → `Redirect URI` | eBay | sandbox | `EBAY_SANDBOX_REDIRECT_URI` o `EBAY_REDIRECT_URI` | `ebay.redirectUri` | RuName |
| `eBay producción` → `App ID` | eBay | production | `EBAY_PRODUCTION_APP_ID` o `EBAY_APP_ID` | `ebay.appId` | Solo si se usa prod |
| `eBay producción` → `Dev ID` | eBay | production | `EBAY_PRODUCTION_DEV_ID` o `EBAY_DEV_ID` | `ebay.devId` | Mismo Dev ID que sandbox |
| `eBay producción` → `Cert ID` | eBay | production | `EBAY_PRODUCTION_CERT_ID` o `EBAY_CERT_ID` | `ebay.certId` | Solo si se usa prod |
| `OpenAI` → `sk-proj-...` | OpenAI | - | `OPENAI_API_KEY` | `openai.apiKey` | AI Provider |
| `Gemini AI : AIzaSy...` | Gemini | - | `GEMINI_API_KEY` | `gemini.apiKey` | AI Provider (duplicado) |
| `GEMINI_API_KEY AIzaSyBo...` | Gemini | - | `GEMINI_API_KEY` | `gemini.apiKey` | AI Provider (duplicado, usar este) |
| `ScraperAPI Key : dcf6700...` | ScraperAPI | - | `SCRAPERAPI_KEY` | `scraperapi.apiKey` | Scraping service |
| `ZenRows API: 4aec1ce...` | ZenRows | - | `ZENROWS_API_KEY` | `zenrows.apiKey` | Scraping service |
| `brightdata: b00c69f...` | BrightData | - | `BRIGHTDATA_API_KEY` | `brightdata.apiKey` | Scraping service (no usado actualmente) |
| `PayPal` → `client ID` | PayPal | sandbox/prod | `PAYPAL_CLIENT_ID` | `paypal.clientId` | Por defecto sandbox |
| `PayPal` → `secret Key` | PayPal | sandbox/prod | `PAYPAL_CLIENT_SECRET` | `paypal.clientSecret` | Por defecto sandbox |
| `SENDGRID_API_KEY SWD2C5P...` | SendGrid/Twilio | - | `SENDGRID_API_KEY` o `TWILIO_API_KEY` | `twilio.apiKey` | Notificaciones (Twilio) |
| `STRIPE_SECRET_KEY pk_test_...` | Stripe | sandbox | `STRIPE_SANDBOX_PUBLIC_KEY` | `stripe.publicKey` | Test key (pk_test) |
| `STRIPE_WEBHOOK_SECRET sk_test_...` | Stripe | sandbox | `STRIPE_SANDBOX_SECRET_KEY` | `stripe.secretKey` | Test key (sk_test) |
| `Exchange API Key 0895d456...` | Exchange Rate API | - | `EXCHANGE_API_KEY` | `exchange.apiKey` | Tipo de cambio (no usado actualmente) |

---

## 🔄 ESTRATEGIA DE CONFIGURACIÓN

### 1. Variables de Entorno (`.env`)

**Ubicación**: `backend/.env`

**Propósito**: Valores por defecto para desarrollo local y fallback si no hay credenciales en BD.

**Configuración**:
- **Desarrollo/Staging**: Usar credenciales de **sandbox**
- **Producción**: Usar credenciales de **producción** (solo en `.env.production` o variables de Railway/Vercel)

### 2. Base de Datos (`ApiCredential`)

**Ubicación**: Tabla `api_credentials` en PostgreSQL

**Propósito**: Credenciales encriptadas por usuario y entorno.

**Estructura**:
```typescript
{
  userId: number,
  apiName: 'ebay' | 'groq' | 'paypal' | ...,
  environment: 'sandbox' | 'production',
  credentials: string, // JSON encriptado
  scope: 'user' | 'global',
  isActive: true
}
```

**Configuración**:
- Para usuario admin (ID: 1): Configurar como `scope: 'global'` para compartir
- Para usuarios individuales: Configurar como `scope: 'user'`

---

## ⚠️ NOTAS IMPORTANTES

1. **eBay**: 
   - El mismo `Dev ID` se usa para sandbox y producción
   - `Redirect URI` solo aplica para sandbox (según APIS.txt)
   - Los tokens OAuth se generan después de autorizar (no están en APIS.txt)

2. **PayPal**:
   - No se especifica si es sandbox o producción en APIS.txt
   - Por defecto usar `sandbox` para desarrollo
   - Si se necesita producción, configurar manualmente

3. **Stripe**:
   - Las claves en APIS.txt son de test (`pk_test`, `sk_test`)
   - Configurar como `sandbox` environment

4. **Gemini**:
   - Hay dos entradas en APIS.txt
   - Usar la segunda: `GEMINI_API_KEY AIzaSyBo...`

5. **APIs no implementadas**:
   - `brightdata`: No se usa actualmente en el código
   - `Exchange API Key`: No se usa actualmente en el código

---

## 🔐 SEGURIDAD

- ✅ **NO** imprimir valores reales en logs
- ✅ **NO** commitear `.env` (debe estar en `.gitignore`)
- ✅ Credenciales en BD están **encriptadas**
- ✅ Variables de entorno son **opcionales** (fallback)

---

## 📝 PRÓXIMOS PASOS

1. Crear script `scripts/configure-apis-from-file.ts` que:
   - Lee `APIS.txt`
   - Mapea valores a estructura esperada
   - Configura en BD (encriptado) para usuario admin
   - Opcionalmente actualiza `.env` para desarrollo

2. Crear script `scripts/test-apis.ts` que:
   - Verifica cada API configurada
   - Hace llamadas mínimas seguras
   - Reporta OK/ERROR sin mostrar claves

3. Ejecutar configuración y tests
4. Generar `API_CONFIG_STATUS.md` con resultados

