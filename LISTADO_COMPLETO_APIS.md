# 🔑 LISTADO COMPLETO DE TODAS LAS APIs - Ivan Reseller Web

## 📋 Resumen Ejecutivo

El sistema Ivan Reseller Web requiere configuración de **15+ servicios de API** distribuidos en las siguientes categorías:

1. **APIs de Marketplaces** (Sandbox + Producción) - 3 plataformas
2. **APIs de Inteligencia Artificial** - 2 servicios
3. **APIs de Web Scraping** - 3 servicios
4. **APIs de Pagos** - 1 servicio
5. **APIs de Notificaciones** - 3 servicios  
6. **APIs de Compra Automatizada** - 1 servicio

**Total: ~30 configuraciones** (considerando sandbox + producción)

---

## 🛒 CATEGORÍA 1: APIs de MARKETPLACES

Estas APIs requieren configuración para **SANDBOX Y PRODUCCIÓN** separadamente.

### 1. eBay Trading API ✅

#### A) eBay SANDBOX (Desarrollo/Testing)
**Propósito:** Testing y desarrollo antes de publicación real  
**Portal:** https://developer.ebay.com/my/keys

**Credenciales requeridas:**
- `EBAY_SANDBOX_APP_ID` - Application ID (Client ID)
- `EBAY_SANDBOX_DEV_ID` - Developer ID
- `EBAY_SANDBOX_CERT_ID` - Certificate ID (Client Secret)
- `EBAY_SANDBOX_AUTH_TOKEN` - User Token (OAuth)

**Funciones:**
- Testing de listados de productos
- Pruebas de inventario
- Simulación de ventas
- Validación de precios

#### B) eBay PRODUCTION (Producción)
**Propósito:** Publicación real de productos  
**Portal:** https://developer.ebay.com/my/keys

**Credenciales requeridas:**
- `EBAY_PRODUCTION_APP_ID` - Application ID (Client ID)
- `EBAY_PRODUCTION_DEV_ID` - Developer ID
- `EBAY_PRODUCTION_CERT_ID` - Certificate ID (Client Secret)
- `EBAY_PRODUCTION_AUTH_TOKEN` - User Token (OAuth)

**Funciones:**
- Publicación real de productos
- Gestión de inventario en vivo
- Recepción de webhooks de ventas reales
- Actualización de precios en tiempo real

**APIs utilizadas:**
- ✅ Finding API (búsqueda de productos)
- ✅ Trading API (listar productos)
- ✅ OAuth API (autenticación)
- ✅ Inventory API (gestión de stock)

**Documentación:** https://developer.ebay.com/docs

---

### 2. Amazon SP-API ✅

#### A) Amazon SANDBOX (Desarrollo/Testing)
**Propósito:** Testing sin afectar inventario real  
**Portal:** https://sellercentral.amazon.com

**Credenciales requeridas (8 campos):**
- `AMAZON_SANDBOX_SELLER_ID` - Seller ID (A2XXXXXXXXXX)
- `AMAZON_SANDBOX_CLIENT_ID` - LWA Client ID (amzn1.application-oa2-client.xxxxx)
- `AMAZON_SANDBOX_CLIENT_SECRET` - LWA Client Secret
- `AMAZON_SANDBOX_REFRESH_TOKEN` - LWA Refresh Token (Atzr|xxxxxxxxxx)
- `AMAZON_SANDBOX_ACCESS_KEY_ID` - AWS Access Key ID (AKIAXXXXXXXXXXXXXXXX)
- `AMAZON_SANDBOX_SECRET_ACCESS_KEY` - AWS Secret Access Key
- `AMAZON_SANDBOX_REGION` - AWS Region (us-east-1, eu-west-1, etc.)
- `AMAZON_SANDBOX_MARKETPLACE_ID` - Marketplace ID (ATVPDKIKX0DER para US)

**Funciones:**
- Testing de publicaciones con datos simulados
- Pruebas de firma AWS SigV4
- Validación de inventario

#### B) Amazon PRODUCTION (Producción)
**Propósito:** Ventas reales en Amazon  
**Portal:** https://sellercentral.amazon.com

**Credenciales requeridas (8 campos):**
- `AMAZON_PRODUCTION_SELLER_ID` - Seller ID
- `AMAZON_PRODUCTION_CLIENT_ID` - LWA Client ID
- `AMAZON_PRODUCTION_CLIENT_SECRET` - LWA Client Secret
- `AMAZON_PRODUCTION_REFRESH_TOKEN` - LWA Refresh Token
- `AMAZON_PRODUCTION_ACCESS_KEY_ID` - AWS Access Key ID
- `AMAZON_PRODUCTION_SECRET_ACCESS_KEY` - AWS Secret Access Key
- `AMAZON_PRODUCTION_REGION` - AWS Region
- `AMAZON_PRODUCTION_MARKETPLACE_ID` - Marketplace ID

**Funciones:**
- Publicación real con AWS SigV4 signing
- Gestión de inventario FBA
- Recepción de órdenes reales
- Actualización de precios

**APIs utilizadas:**
- ✅ Catalog Items API 2022-04-01
- ✅ Listings Items API 2021-08-01
- ✅ FBA Inventory API
- ✅ Orders API

**Proceso de aprobación:** 5-7 días  
**Documentación:** https://developer-docs.amazon.com/sp-api/

---

### 3. MercadoLibre API ✅

#### A) MercadoLibre SANDBOX (Testing)
**Propósito:** Desarrollo sin afectar cuenta real  
**Portal:** https://developers.mercadolibre.com

**Credenciales requeridas:**
- `MERCADOLIBRE_SANDBOX_CLIENT_ID` - App ID
- `MERCADOLIBRE_SANDBOX_CLIENT_SECRET` - Secret Key
- `MERCADOLIBRE_SANDBOX_REDIRECT_URI` - URL de callback
- `MERCADOLIBRE_SANDBOX_ACCESS_TOKEN` - Token de acceso (generado automáticamente)
- `MERCADOLIBRE_SANDBOX_REFRESH_TOKEN` - Refresh token

**Funciones:**
- Testing de publicaciones
- Pruebas de OAuth2
- Simulación de ventas

#### B) MercadoLibre PRODUCTION (Producción)
**Propósito:** Publicación real  
**Portal:** https://developers.mercadolibre.com

**Credenciales requeridas:**
- `MERCADOLIBRE_PRODUCTION_CLIENT_ID` - App ID
- `MERCADOLIBRE_PRODUCTION_CLIENT_SECRET` - Secret Key
- `MERCADOLIBRE_PRODUCTION_REDIRECT_URI` - URL de callback
- `MERCADOLIBRE_PRODUCTION_ACCESS_TOKEN` - Token de acceso (generado automáticamente)
- `MERCADOLIBRE_PRODUCTION_REFRESH_TOKEN` - Refresh token

**Funciones:**
- Publicación real de productos
- Gestión de inventario
- Recepción de webhooks de ventas
- Actualización de precios

**Documentación:** https://developers.mercadolibre.com/es_ar/api-docs

---

## 🤖 CATEGORÍA 2: APIs de INTELIGENCIA ARTIFICIAL

### 4. GROQ AI API ✅
**Propósito:** Generación de contenido IA de alta velocidad  
**Portal:** https://console.groq.com

**Credenciales requeridas:**
- `GROQ_API_KEY` - API Key de GROQ

**Funciones:**
- ✅ Generación de títulos SEO optimizados
- ✅ Generación de descripciones de productos
- ✅ Análisis de rentabilidad con IA
- ✅ Recomendaciones de precios inteligentes
- ✅ Optimización de keywords

**Modelo usado:** llama-3.1-70b-versatile  
**Velocidad:** ~400 tokens/segundo  
**Costo:** Gratis hasta 14,400 requests/día  
**Endpoint:** https://api.groq.com/openai/v1/chat/completions

**Documentación:** https://console.groq.com/docs

---

### 5. OpenAI API (Opcional - Alternativa/Complemento) ⚠️
**Propósito:** IA avanzada para análisis complejos  
**Portal:** https://platform.openai.com

**Credenciales requeridas:**
- `OPENAI_API_KEY` - API Key de OpenAI

**Funciones (si se implementa):**
- Análisis de mercado avanzado
- Generación de contenido con GPT-4
- Análisis de sentimiento de reviews
- Traducción de descripciones

**Modelos sugeridos:**
- gpt-4-turbo-preview (más preciso, más caro)
- gpt-3.5-turbo (rápido, económico)

**Costo:** Variable según modelo  
**Documentación:** https://platform.openai.com/docs

**NOTA:** Actualmente el sistema usa GROQ. OpenAI se menciona como opción futura.

---

## 🕷️ CATEGORÍA 3: APIs de WEB SCRAPING

### 6. ScraperAPI ✅
**Propósito:** Scraping de AliExpress con rotación de IPs  
**Portal:** https://www.scraperapi.com

**Credenciales requeridas:**
- `SCRAPERAPI_KEY` - API Key de ScraperAPI

**Funciones:**
- ✅ Scraping de productos de AliExpress
- ✅ Rotación automática de IPs
- ✅ Bypass de Cloudflare
- ✅ Extracción de precios y especificaciones
- ✅ Manejo de CAPTCHAs

**Límites:** Según plan (1,000 - 250,000 requests/mes)  
**Costo:** Desde $29/mes (1,000 requests)  
**Endpoint:** http://api.scraperapi.com/

**Documentación:** https://www.scraperapi.com/documentation

---

### 7. ZenRows API ✅
**Propósito:** Scraping avanzado con JS rendering (alternativa a ScraperAPI)  
**Portal:** https://www.zenrows.com

**Credenciales requeridas:**
- `ZENROWS_API_KEY` - API Key de ZenRows

**Funciones:**
- ✅ Scraping con renderizado JavaScript
- ✅ Bypass de protecciones anti-bot avanzadas
- ✅ Extracción de datos dinámicos
- ✅ Soporte para sitios con React/Vue/Angular
- ✅ CAPTCHA solving integrado

**Límites:** Según plan (1,000 - 250,000 requests/mes)  
**Costo:** Desde $49/mes  
**Endpoint:** https://api.zenrows.com/v1/

**Documentación:** https://www.zenrows.com/documentation

---

### 8. 2Captcha API ✅
**Propósito:** Resolución automática de CAPTCHAs  
**Portal:** https://2captcha.com

**Credenciales requeridas:**
- `CAPTCHA_2CAPTCHA_KEY` - API Key de 2Captcha

**Funciones:**
- ✅ Resolución de reCAPTCHA v2
- ✅ Resolución de reCAPTCHA v3
- ✅ Resolución de hCaptcha
- ✅ Resolución de image captchas
- ✅ Resolución de FunCaptcha

**Costo:** ~$1 - $3 por 1,000 CAPTCHAs  
**Velocidad:** 10-30 segundos por CAPTCHA  
**Documentación:** https://2captcha.com/api-docs

---

## 💰 CATEGORÍA 4: APIs de PAGOS

### 9. PayPal Payouts API ✅

#### A) PayPal SANDBOX (Testing)
**Propósito:** Testing de pagos sin dinero real  
**Portal:** https://developer.paypal.com

**Credenciales requeridas:**
- `PAYPAL_SANDBOX_CLIENT_ID` - Client ID (AYxxxxxxxxxxxxx)
- `PAYPAL_SANDBOX_CLIENT_SECRET` - Client Secret (EGxxxxxxxxxxxxx)
- `PAYPAL_SANDBOX_ENVIRONMENT` = `sandbox`

**Funciones:**
- Testing de pagos de comisiones
- Simulación de transacciones
- Pruebas de batch payouts

#### B) PayPal PRODUCTION (Producción)
**Propósito:** Pagos reales de comisiones a usuarios  
**Portal:** https://developer.paypal.com

**Credenciales requeridas:**
- `PAYPAL_PRODUCTION_CLIENT_ID` - Client ID (AYxxxxxxxxxxxxx)
- `PAYPAL_PRODUCTION_CLIENT_SECRET` - Client Secret (EGxxxxxxxxxxxxx)
- `PAYPAL_PRODUCTION_ENVIRONMENT` = `production`

**Funciones:**
- ✅ Pagos automáticos de comisiones
- ✅ Pagos individuales ($0.25 fee por pago)
- ✅ Pagos en lote hasta 15,000 transacciones ($0.25 fee c/u)
- ✅ Tracking de transacciones
- ✅ Cancelación de pagos no reclamados

**Límites:**
- Máximo 15,000 pagos por batch
- Mínimo $1 USD por pago
- Máximo $10,000 USD por pago individual

**Costo:** $0.25 USD por transacción  
**Endpoint Sandbox:** https://api-m.sandbox.paypal.com  
**Endpoint Production:** https://api-m.paypal.com

**Documentación:** https://developer.paypal.com/api/rest/

---

### 10. Stripe API (Opcional - Futuro) ⚠️
**Propósito:** Alternativa de pagos / Suscripciones  
**Portal:** https://dashboard.stripe.com

**Credenciales requeridas (si se implementa):**
- `STRIPE_PUBLISHABLE_KEY` - Public key
- `STRIPE_SECRET_KEY` - Secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret

**Funciones potenciales:**
- Pagos de suscripciones de usuarios
- Cobro de comisiones de plataforma
- Pagos con tarjeta
- Transfers a cuentas bancarias

**NOTA:** No implementado actualmente. PayPal Payouts es el método principal.

---

## 📧 CATEGORÍA 5: APIs de NOTIFICACIONES

### 11. Nodemailer / SMTP (Email) ✅
**Propósito:** Envío de emails transaccionales  
**Configuración:** SMTP o servicio de email

**Credenciales requeridas:**
- `EMAIL_HOST` - Servidor SMTP (smtp.gmail.com, smtp.sendgrid.net, etc.)
- `EMAIL_PORT` - Puerto SMTP (587, 465, 25)
- `EMAIL_USER` - Usuario/Email de autenticación
- `EMAIL_PASSWORD` - Contraseña o API key
- `EMAIL_FROM` - Email remitente (noreply@ivanreseller.com)
- `EMAIL_SECURE` - true/false (TLS/SSL)

**Funciones:**
- ✅ Emails de bienvenida
- ✅ Notificaciones de ventas
- ✅ Alertas de comisiones
- ✅ Recuperación de contraseña
- ✅ Reportes periódicos

**Servicios compatibles:**
- Gmail SMTP (gratis, 500/día)
- SendGrid (12,000 gratis/mes)
- Mailgun (5,000 gratis/mes)
- AWS SES (62,000 gratis/mes)
- Resend (3,000 gratis/mes)

---

### 12. Twilio API (SMS/WhatsApp) ✅
**Propósito:** Notificaciones por SMS y WhatsApp  
**Portal:** https://console.twilio.com

**Credenciales requeridas:**
- `TWILIO_ACCOUNT_SID` - Account SID (ACxxxxxxxxxxxxx)
- `TWILIO_AUTH_TOKEN` - Auth Token
- `TWILIO_PHONE_NUMBER` - Número de teléfono Twilio (+1234567890)
- `TWILIO_WHATSAPP_NUMBER` - Número WhatsApp Business (opcional)

**Funciones:**
- ✅ SMS de notificaciones importantes
- ✅ Alertas de ventas por SMS
- ✅ Notificaciones de comisiones
- ✅ WhatsApp Business messages
- ✅ 2FA por SMS

**Costo:**
- SMS: ~$0.0075 por mensaje
- WhatsApp: ~$0.005 por mensaje

**Documentación:** https://www.twilio.com/docs/sms

---

### 13. Slack API (Notificaciones Team) ✅
**Propósito:** Notificaciones en tiempo real al equipo  
**Portal:** https://api.slack.com

**Credenciales requeridas:**
- `SLACK_BOT_TOKEN` - Bot User OAuth Token (xoxb-xxxxxxxxxxxxx)
- `SLACK_WEBHOOK_URL` - Incoming Webhook URL (opcional)
- `SLACK_CHANNEL_ID` - ID del canal de notificaciones

**Funciones:**
- ✅ Alertas de ventas al equipo
- ✅ Notificaciones de errores críticos
- ✅ Reportes diarios automáticos
- ✅ Alertas de oportunidades encontradas
- ✅ Monitoring del sistema

**Costo:** Gratis  
**Documentación:** https://api.slack.com/messaging/webhooks

---

## 🛍️ CATEGORÍA 6: COMPRA AUTOMATIZADA

### 14. AliExpress Auto-Purchase (Puppeteer) ✅
**Propósito:** Compra automática en AliExpress sin API oficial  
**Método:** Browser Automation (Puppeteer + Stealth)

**Credenciales requeridas:**
- `ALIEXPRESS_EMAIL` - Email o username de cuenta AliExpress
- `ALIEXPRESS_PASSWORD` - Contraseña (encriptada con AES-256)
- `ALIEXPRESS_2FA_ENABLED` - true/false (si tienes 2FA)
- `ALIEXPRESS_DEFAULT_ADDRESS` - Dirección de envío predeterminada (JSON)
- `ALIEXPRESS_PAYMENT_METHOD` - Método de pago preferido (opcional)

**Funciones:**
- ✅ Login automático con cookies persistentes
- ✅ Soporte para 2FA (requiere intervención manual primera vez)
- ✅ Compra automática de productos
- ✅ Verificación de precios antes de comprar
- ✅ Llenado automático de dirección de envío
- ✅ Tracking de órdenes
- ✅ Screenshots de debugging

**Limitaciones:**
- ⚠️ No existe API oficial de AliExpress para compras
- ⚠️ Usa browser automation (Puppeteer)
- ⚠️ Toma 20-30 segundos por compra
- ⚠️ Frágil a cambios en la UI de AliExpress
- ⚠️ Requiere mantener sesión activa

**SEGURIDAD:** El paso final de "Confirm Payment" está comentado por seguridad. Debe descomentarse manualmente para producción.

**Archivos:**
- `backend/src/services/aliexpress-auto-purchase.service.ts`
- Usa Puppeteer + puppeteer-extra-plugin-stealth

---

## 🔧 CATEGORÍA 7: APIS OPCIONALES / FUTURAS

### 15. Webhooks URLs (Configuración de Sistema)
**Propósito:** Recibir notificaciones de marketplaces

**URLs a configurar en cada plataforma:**

#### eBay Webhooks
- `https://tu-dominio.com/api/webhooks/ebay/orders` - Nuevas órdenes
- `https://tu-dominio.com/api/webhooks/ebay/inventory` - Cambios de inventario

#### Amazon Webhooks
- `https://tu-dominio.com/api/webhooks/amazon/orders` - Nuevas órdenes
- `https://tu-dominio.com/api/webhooks/amazon/inventory` - Cambios de inventario

#### MercadoLibre Webhooks
- `https://tu-dominio.com/api/webhooks/mercadolibre/orders` - Nuevas órdenes
- `https://tu-dominio.com/api/webhooks/mercadolibre/questions` - Preguntas de clientes

#### PayPal Webhooks
- `https://tu-dominio.com/api/webhooks/paypal/payout` - Estado de pagos

---

## 📊 RESUMEN DE CONFIGURACIONES

### Total de Credenciales a Configurar:

| Categoría | Servicio | Sandbox | Producción | Total Configs |
|-----------|----------|---------|------------|---------------|
| **Marketplaces** | eBay | 4 campos | 4 campos | 8 |
| | Amazon SP-API | 8 campos | 8 campos | 16 |
| | MercadoLibre | 5 campos | 5 campos | 10 |
| **IA** | GROQ AI | - | 1 campo | 1 |
| | OpenAI (opcional) | - | 1 campo | 1 |
| **Scraping** | ScraperAPI | - | 1 campo | 1 |
| | ZenRows | - | 1 campo | 1 |
| | 2Captcha | - | 1 campo | 1 |
| **Pagos** | PayPal Payouts | 3 campos | 3 campos | 6 |
| | Stripe (opcional) | 3 campos | 3 campos | 6 |
| **Notificaciones** | Nodemailer/SMTP | - | 6 campos | 6 |
| | Twilio | - | 4 campos | 4 |
| | Slack | - | 3 campos | 3 |
| **Compra Auto** | AliExpress | - | 5 campos | 5 |
| **Webhooks** | URLs | - | 9 URLs | 9 |

**TOTAL MÍNIMO (sin opcionales):** ~60 configuraciones  
**TOTAL COMPLETO (con opcionales):** ~78 configuraciones

---

## 🎯 PRIORIDAD DE IMPLEMENTACIÓN

### FASE 1: CRÍTICAS (Para MVP)
1. ✅ **GROQ AI API** - Generación de contenido IA
2. ✅ **eBay Sandbox** - Testing de publicaciones
3. ✅ **ScraperAPI** - Obtener productos de AliExpress
4. ✅ **Nodemailer/SMTP** - Emails básicos
5. ✅ **PayPal Sandbox** - Testing de pagos

### FASE 2: IMPORTANTES (Para Beta)
6. ✅ **eBay Production** - Publicación real
7. ✅ **Amazon Sandbox** - Testing Amazon
8. ✅ **MercadoLibre Sandbox** - Testing MercadoLibre
9. ✅ **2Captcha** - Resolver captchas
10. ✅ **PayPal Production** - Pagos reales

### FASE 3: AVANZADAS (Para Producción)
11. ✅ **Amazon Production** - Ventas Amazon reales
12. ✅ **MercadoLibre Production** - Ventas MercadoLibre reales
13. ✅ **AliExpress Auto-Purchase** - Compra automática
14. ✅ **Twilio** - SMS notifications
15. ✅ **Slack** - Alertas equipo

### FASE 4: OPCIONALES (Mejoras Futuras)
16. ⚠️ **OpenAI API** - IA alternativa/complemento
17. ⚠️ **ZenRows** - Scraping alternativo
18. ⚠️ **Stripe** - Pagos alternativos
19. ⚠️ **Webhooks** - Notificaciones en tiempo real

---

## 💡 RECOMENDACIONES DE CONFIGURACIÓN

### 1. Orden de Setup Recomendado:

```
PASO 1: Configurar GROQ AI (gratis)
   └─> Habilita generación de contenido inmediatamente

PASO 2: Configurar ScraperAPI (trial gratis)
   └─> Permite obtener productos de AliExpress

PASO 3: Configurar eBay Sandbox (gratis)
   └─> Testing de publicaciones sin riesgo

PASO 4: Configurar Nodemailer con Gmail (gratis)
   └─> Emails de sistema funcionando

PASO 5: Configurar PayPal Sandbox (gratis)
   └─> Testing de pagos de comisiones

PASO 6: Testing completo del flujo
   └─> Verificar que todo funcione en sandbox

PASO 7: Configurar servicios de producción
   └─> eBay Production, Amazon, MercadoLibre

PASO 8: Configurar pagos reales
   └─> PayPal Production

PASO 9: Configurar notificaciones avanzadas
   └─> Twilio, Slack
```

### 2. Costos Estimados Mensuales:

```
TIER BÁSICO (MVP):
- GROQ AI: $0 (gratis hasta 14,400 req/día)
- ScraperAPI: $29/mes (1,000 requests)
- 2Captcha: ~$10/mes (estimado)
- Gmail SMTP: $0 (gratis 500/día)
- PayPal: $0.25 por pago
TOTAL: ~$39/mes + $0.25 por pago

TIER PROFESIONAL:
- GROQ AI: $0
- ScraperAPI: $99/mes (10,000 requests)
- 2Captcha: ~$30/mes
- SendGrid: $0 (gratis 12K/mes)
- Twilio: ~$20/mes (variable)
- PayPal: $0.25 por pago
TOTAL: ~$149/mes + $0.25 por pago

TIER ENTERPRISE:
- OpenAI: ~$100/mes (variable)
- ScraperAPI: $249/mes (100K requests)
- ZenRows: $99/mes (backup)
- 2Captcha: ~$50/mes
- SendGrid: $19.95/mes (50K emails)
- Twilio: ~$50/mes
- Slack: $0
- PayPal: $0.25 por pago
TOTAL: ~$567/mes + $0.25 por pago
```

### 3. Seguridad:

- ✅ Todas las credenciales se encriptan con **AES-256-GCM**
- ✅ Keys nunca se exponen en logs
- ✅ Separación de sandbox/production previene errores
- ✅ Tokens se regeneran automáticamente (OAuth)
- ✅ Variables de entorno seguras en Railway/Vercel

---

## 📝 CHECKLIST DE CONFIGURACIÓN

### Para el Usuario Final:

```markdown
## APIs de Marketplaces

### eBay
- [ ] Crear cuenta Developer en developer.ebay.com
- [ ] Generar credenciales Sandbox (4 campos)
- [ ] Generar credenciales Production (4 campos)
- [ ] Configurar en `/settings/apis` → eBay API

### Amazon
- [ ] Registrarse en Seller Central
- [ ] Solicitar acceso SP-API (5-7 días)
- [ ] Crear LWA credentials
- [ ] Crear IAM user para AWS keys
- [ ] Generar credenciales Sandbox (8 campos)
- [ ] Generar credenciales Production (8 campos)
- [ ] Configurar en `/settings/apis` → Amazon SP-API

### MercadoLibre
- [ ] Crear cuenta en developers.mercadolibre.com
- [ ] Crear aplicación
- [ ] Generar credenciales Sandbox (5 campos)
- [ ] Generar credenciales Production (5 campos)
- [ ] Configurar en `/settings/apis` → MercadoLibre API

## APIs de IA

### GROQ AI
- [ ] Registrarse en console.groq.com
- [ ] Generar API Key (1 campo)
- [ ] Configurar en `/settings/apis` → GROQ AI API

## APIs de Scraping

### ScraperAPI
- [ ] Registrarse en scraperapi.com
- [ ] Elegir plan (desde $29/mes)
- [ ] Generar API Key (1 campo)
- [ ] Configurar en `/settings/apis` → ScraperAPI

### 2Captcha
- [ ] Registrarse en 2captcha.com
- [ ] Recargar saldo ($5 mínimo)
- [ ] Generar API Key (1 campo)
- [ ] Configurar en `/settings/apis` → 2Captcha

## APIs de Pagos

### PayPal Payouts
- [ ] Crear cuenta Business en PayPal
- [ ] Registrarse en developer.paypal.com
- [ ] Crear aplicación
- [ ] Generar credenciales Sandbox (3 campos)
- [ ] Generar credenciales Production (3 campos)
- [ ] Configurar en `/settings/apis` → PayPal Payouts API

## APIs de Notificaciones

### Email (SMTP)
- [ ] Elegir servicio (Gmail/SendGrid/Mailgun/etc)
- [ ] Configurar SMTP (6 campos)
- [ ] Configurar en `/settings/apis` → Email Settings

### Twilio (SMS)
- [ ] Registrarse en twilio.com
- [ ] Comprar número de teléfono
- [ ] Generar credenciales (4 campos)
- [ ] Configurar en `/settings/apis` → Twilio API

### Slack (Alertas)
- [ ] Crear Slack Workspace
- [ ] Crear Slack App
- [ ] Generar Bot Token (3 campos)
- [ ] Configurar en `/settings/apis` → Slack API

## Compra Automatizada

### AliExpress
- [ ] Crear cuenta AliExpress
- [ ] Configurar método de pago
- [ ] Agregar dirección de envío
- [ ] Generar credenciales (5 campos)
- [ ] Configurar en `/settings/apis` → AliExpress Auto-Purchase
- [ ] ⚠️ DESCOMENTAR código de confirmación de pago cuando esté listo

## Webhooks

### Configurar URLs en cada plataforma
- [ ] eBay Developer Portal → Webhooks
- [ ] Amazon Seller Central → Notifications
- [ ] MercadoLibre → Webhooks
- [ ] PayPal → Webhooks
```

---

## 🔗 ENLACES ÚTILES

### Portales de Developers:
- **eBay:** https://developer.ebay.com
- **Amazon:** https://developer.amazonservices.com
- **MercadoLibre:** https://developers.mercadolibre.com
- **GROQ:** https://console.groq.com
- **ScraperAPI:** https://www.scraperapi.com
- **2Captcha:** https://2captcha.com
- **PayPal:** https://developer.paypal.com
- **Twilio:** https://console.twilio.com
- **Slack:** https://api.slack.com

### Documentación Técnica:
- **eBay APIs:** https://developer.ebay.com/docs
- **Amazon SP-API:** https://developer-docs.amazon.com/sp-api/
- **MercadoLibre API:** https://developers.mercadolibre.com/es_ar/api-docs
- **GROQ Docs:** https://console.groq.com/docs
- **PayPal Payouts:** https://developer.paypal.com/api/rest/

---

## ✅ CONCLUSIÓN

El sistema requiere configuración de **~60 credenciales** mínimo para estar completamente funcional:

- **34 credenciales** de marketplaces (sandbox + producción)
- **3 credenciales** de IA
- **3 credenciales** de scraping
- **6 credenciales** de pagos
- **13 credenciales** de notificaciones
- **5 credenciales** de compra automatizada

**Todas estas configuraciones están disponibles en la interfaz web en `/settings/apis`**

La página de configuración de APIs debe permitir ingresar TODAS estas credenciales con:
- ✅ Separación clara entre Sandbox y Production
- ✅ Validación de campos requeridos
- ✅ Encriptación automática de datos sensibles
- ✅ Testing de conectividad
- ✅ Indicadores de estado (configurado/no configurado)
- ✅ Documentación inline con links a portales
